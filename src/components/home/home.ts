import Vue from 'vue';
import { VVue } from '../../vvue';
import axios from 'axios';

import * as _ from 'lodash';
import { mapGetters } from 'vuex';
import { GaiaHubConfig } from 'blockstack/lib/storage/hub';
import WrappedKeychain from 'data/wrapped-keychain';
import { decryptECIES } from 'blockstack/lib/encryption';
import { makeV1GaiaAuthToken } from '@/util/token-util';
import * as JSZip from 'jszip';
import * as FileSaver from 'file-saver';
import defaultApps from '../../data/apps-defaults';
import AppsNode from '@/data/apps-node';

const CIPHER_OBJ_KEYS = ['iv', 'ephemeralPK', 'cipherText', 'mac', 'wasString'];
const MORE_APPS = [
  { name: 'Graphite (App)**', website: 'https://app.graphitedocs.com' },
  { name: 'XOR Drive**', website: 'https://xordrive.io' }
];

// otherwise we get booted
const timeout = () => new Promise(res => setTimeout(res, 500));

export default (Vue as VVue).component('mercurius-home', {
  data() {
    return {
      working: false,
      progress: 0,
      workingOn: '',
      dir: '',
      cancel: false,

      bigList: [] as string[],
      folders: [] as string[],
      files: [] as string[],

      lastActive: '',
      lastActiveTime: 0,
      active: {} as { [key: string]: boolean },
      anyActive: false,

      drawing: false,
      drawBegin: { x: 0, y: 0 },
      drawPoints: { x1: 0, y1: 0, x2: 0, y2: 0 },
      drawPos: {
        top: '0px',
        left: '0px',
        height: '0px',
        width: '0px'
      },

      contentType: {} as { [key: string]: string },
      annotations: {} as  { [key: string]: string },
      apps: [] as { name: string, website: string, address: string, privateKey: string }[],
    };
  },
  computed: {
    ...mapGetters({
      activeGaia: 'activeGaiaStore',
      masterKeychain: 'masterKeychain'
    }) as { activeGaia: () => GaiaHubConfig, masterKeychain: () => WrappedKeychain },

    splitDir(): string[] {
      const sdir = [];
      let buff = '';
      this.dir.split('/').forEach(v => {
        if(!v) buff += '/';
        else if(buff) sdir.push(buff + v);
        else sdir.push(v);
      });
      return [
        this.activeGaia.server.replace(/https?:\/\//, ''),
        ...sdir
      ];
    },

    index(): { url_prefix: string, entries: string[] } {
      return { url_prefix: this.activeGaia.url_prefix, entries: this.bigList };
    }
  },
  watch: {
    activeGaia() {
      this.refresh();
    },
    bigList() {
      this.populate().catch(err => this.handleError(err));
    },
    dir() {
      this.active = { };
      this.lastActive = '';
      this.lastActiveTime = 0;

      this.populate().catch(err => this.handleError(err));

      if(this.$route.path !== '/' + this.dir)
        this.$router.replace({ path: '/' + this.dir });
    },
    $route() {
      if(this.$route.path !== '/' + this.dir &&
        this.bigList.find(a => a.startsWith(this.$route.path.slice(1))))
          this.dir = this.$route.path.slice(1);
    },
    active() {
      this.anyActive = this.active && Object.values(this.active).reduce((a, b) => a || b, false);
    }
  },
  mounted() {

    window.addEventListener('mouseup', this.drawEnd);
    window.addEventListener('mousemove', this.drawContinue);

    if(this.$store.state.bigListCache && this.$store.state.bigListCache.length) {
      this.bigList = this.$store.state.bigListCache;

      if(this.$store.state.appCache && this.$store.state.appCache.length) {
        this.apps = this.$store.state.appCache;
        this.annotations = { [this.activeGaia.address]: 'User' };
        for(const app of this.apps)
          Vue.set(this.annotations, app.address, app.name);
      } else
        this.getApps();

      if(this.bigList.find(a => a.startsWith(this.$route.path.slice(1))))
        this.dir = this.$route.path.slice(1);

      return;
    }

    this.$router.replace('');
    this.refresh();
  },
  destroyed() {
    window.removeEventListener('mouseup', this.drawEnd);
    window.removeEventListener('mousemove', this.drawContinue);
  },
  methods: {
    handleError(err: Error | unknown) {
      console.error(err);
      this.$buefy.dialog.alert({ title: 'error', type: 'error', message: 'Error: ' + (err instanceof Error ? err.message : err), });
    },
    async listBucketFiles(gaiaHubConfig: GaiaHubConfig) {
      const headers = { Authorization: 'bearer ' + gaiaHubConfig.token };
      const bigList: string[] = [];
      let page: number;

      do {
        const url = gaiaHubConfig.server + '/list-files/' + gaiaHubConfig.address;
        const res = await axios.post<{
          entries: string[];
          page?: number;
        }>(url, { page }, { headers });

        if(res.data.page)
          page = res.data.page;
        else
          page = 0;

        bigList.push(...res.data.entries);
      } while(page && await timeout());

      return bigList;
    },
    makeApp(skeleton: { website: string, name?: string }, appsNode?: AppsNode) {
      if(!skeleton.name)
        skeleton.name = skeleton.website.replace(/https?:\/\//, '');

      appsNode = appsNode || this.masterKeychain.getIdentityOwnerAddressNode(0).appsNode;
      const node = appsNode.getAppNode(skeleton.website);

      const address = node.getAddress();

      if(this.annotations[address])
        return null;

      Vue.set(this.annotations, address, skeleton.name);

      return {
        name: skeleton.name,
        website: skeleton.website,
        address,
        privateKey: node.privateKey.toString('hex')
      };
    },
    async getApps() {
      const newApps: { name: string, website: string, address: string, privateKey: string }[] = [];

      if(!this.apps || this.apps.length === 0)
        this.apps = newApps;

      this.workingOn = 'Getting all available apps';
      this.annotations = { [this.activeGaia.address]: 'User' };

      const evenMoreExtraApps: { name: string, website: string }[] = [];

      try {
        const r = await axios.get(this.activeGaia.url_prefix + this.activeGaia.address + '/profile.json');
        const a = r.data[0].decodedToken.payload.claim.apps as { [key: string]: string };
        for(const k in a) if(a[k]) evenMoreExtraApps.push({ name: k.replace(/https?:\/\//, ''), website: k });
      } catch(e) {
        console.warn('Issue getting profile: ', e);
      }

      const appsNode = this.masterKeychain.getIdentityOwnerAddressNode(0).appsNode;
      let res;
      try {
        // res = await axios.get('https://api.app.co/api/app-mining-apps'); // good for testing / qc
        res = await axios.get('https://api.app.co/api/apps'); // quite large, but "needed" for prod
      } catch(e) {
        this.handleError(e);
        this.workingOn = '';
        res = { data: { apps: [] } };
      }

      const apps: { name: string, website: string }[] = res.data.apps.filter(a =>
        (a.storageNetworkID === 0 || a.storageNetwork === 'Gaia') &&
        (a.authenticationID === 0 || a.authentication === 'Blockstack'))
        .concat(defaultApps.apps.map(a => ({ name: a.name + '*', website: a.launchLink })))
        .concat(evenMoreExtraApps)
        .concat(MORE_APPS);

      for(const app of apps) {
        const a = this.makeApp(app, appsNode);
        if(a)
          newApps.push(a);
      }

      this.apps = newApps;
      this.$store.commit('setAppCache', newApps);

      this.workingOn = '';
    },
    async listFilesSingle(app: { address: string, privateKey: string, name: string }, hubInfo: {
      challenge_text: string,
      latest_auth_version: string,
      read_url_prefix: string
    }, server: string) {
      try {
        const gc: GaiaHubConfig = { // optimized so we don't spam hub_info as well as /list-files
          url_prefix: hubInfo.read_url_prefix,
          address: app.address,
          max_file_upload_size_megabytes: 5,
          token: makeV1GaiaAuthToken(hubInfo, app.privateKey, server),
          server
        };
        const list = await this.listBucketFiles(gc);

        if(list.length)
          return list.map(a => app.address + '/' + a);
        else return [];
      } catch(e) {
        console.error('Error listing files for app ' + app.name + '!');
        console.error(e);
      }
    },
    async listFiles() {
      this.progress = 0;
      await this.getApps();
      const hubInfo: {
        challenge_text: string,
        latest_auth_version: string,
        read_url_prefix: string
      } = (await axios.get(this.activeGaia.server + '/hub_info')).data;
      const server = this.activeGaia.server;

      const bigList: string[] = [];
      if(!this.bigList || this.bigList.length === 0)
        this.bigList = bigList;

        this.workingOn = 'Getting profile app bucket';
        const myList = await this.listBucketFiles(this.activeGaia);
        bigList.push(...myList.map(a => this.activeGaia.address + '/' + a));
        this.annotations[this.activeGaia.address] = 'User';

      for(let i = 0, app = this.apps[i]; i < this.apps.length; i++, app = this.apps[i]) {
        this.workingOn = 'Looking up ' + app.name + '\'s app bucket (' + i + '/' + this.apps.length + ')';
        const list = await this.listFilesSingle(app, hubInfo, server);
        if(list)
          bigList.push(...list);
        this.progress += 1 / (this.apps.length + 1);
        if(this.cancel) break;
        await timeout();
      }
      this.cancel = false;

      this.workingOn = 'Finishing up';
      this.progress = 1;
      this.bigList = bigList.sort();
      this.workingOn = '';
    },
    async populate() {
      const slice = this.bigList
        .filter(a => this.dir ? a.startsWith(this.dir + '/') : true)
        .map(a => this.dir ? a.slice(this.dir.length + 1) : a);
      this.folders.splice(0);
      this.files.splice(0);

      for(const a of slice) {
        if(/\w\//.test(a)) {
          const c = /^(\/*.+?)\//.exec(a)[1];
          if(!this.folders.find(b => b === c))
            this.folders.push(c);
        } else
          this.files.push(a);
      }
    },
    async refresh() {
      if(this.working)
        return;

      this.working = true;

      this.$store.commit('setBigListCache', []);
      this.$store.commit('setAppCache', []);

      return this.listFiles()
        .then(() => {
          this.working = false;
          this.$store.commit('setBigListCache', this.bigList);
        }).catch(err => { this.working = false; this.handleError(err); });
    },
    goto(dir: number) {
      if(dir <= 0) {
        this.dir = '';
        return;
      } else if(dir >= this.splitDir.length)
        return;

      this.dir = this.splitDir.slice(1, dir + 1).join('/').replace(/\/$/, '');
    },
    onClick(event: MouseEvent, item) {
      if(event.getModifierState('Shift') || event.shiftKey) {
        const allItems = this.folders.map(a => '/' + a).concat(this.files);
        const s1 = allItems.indexOf(this.lastActive);
        const s2 = allItems.indexOf(item);
        const items = allItems.slice(Math.min(s1, s2), Math.max(s1, s2) + 1);

        if(event.getModifierState('Control') || event.ctrlKey)
          for(const i of items)
            Vue.set(this.active, i, true);
        else
          this.active = items.reduce((acc, c) => { acc[c] = true; return acc; }, { });

        this.lastActiveTime = 0;
        return; // no 'lastActive' whatnot
      } else if(event.getModifierState('Control') || event.ctrlKey) {
        this.active[item] = !this.active[item];
        this.lastActiveTime = 0;
      } else {
        this.active = { [item]: true };
        if(Date.now() - this.lastActiveTime < 333) // 1/3 of a sec
          (!item.startsWith('/') || this.files.includes(item)) ? this.openFile(item) : this.openFolder(item.slice(1));
        this.lastActiveTime = Date.now();
      }

      this.lastActive = item;
    },
    openFolder(folder: string) {
      if(this.dir)
        this.dir = (this.dir + '/' + folder).replace(/(^\/)|(\/$)/, '');
      else
        this.dir = folder;
    },
    isDecipherable(data: any): boolean {
      if(typeof data !== 'object')
        return false;
      const keys = Object.keys(data);
      if(keys.length !== CIPHER_OBJ_KEYS.length)
        return false;
      return keys.map(a => CIPHER_OBJ_KEYS.includes(a)).reduce((a, b) => a && b);
    },
    fileUrl(file: string) {
      return this.activeGaia.url_prefix + (this.dir ? this.dir + '/' : '') + file;
    },
    async openFile(file: string, open: boolean = true) {
      const url = this.fileUrl(file);
      const address = this.dir.includes('/') ? this.splitDir[1] : this.dir || file.split('/')[0];
      let pk = '';

      if(address === this.activeGaia.address) {
        pk = this.masterKeychain.getIdentityOwnerAddressNode(0).privateKey.toString('hex');
      } else {
        const app = this.apps.find(a => a.address === address);
        if(app)
          pk = app.privateKey;
      }

      let data: string;

      const res = await axios.get<Blob>(url, { responseType: 'blob' });
      const blob = res.data;
      const type = (res.data as Blob).type;

      let resData: Blob | string | Record<string, unknown> = blob;

      if(type.startsWith('text'))
        resData = await (res.data as Blob).text();
      else if(type === 'application/json')
        resData = JSON.parse(await (res.data as Blob).text());

      const safeName = file.replace(/[/]+/g, '');

      if(pk && !(resData instanceof Blob) && this.isDecipherable(resData)) {
        const decrypted = await decryptECIES(pk, resData as any);
        if(typeof decrypted === 'string')
          data = (file.endsWith('.json') ? 'application/json,' : type + ',') + decrypted;
        else {
          const decryptedBlob = new Blob([new Uint8Array((decrypted as Buffer))], { type });

          if(!open)
            return decryptedBlob;
          else
            FileSaver.saveAs(decryptedBlob, safeName);
        }
      } else if(!open) {
        return blob;
      } else if(resData instanceof Blob) {
        if(!open)
          return blob;
        else
          FileSaver.saveAs(blob, safeName);
      } else if(typeof resData === 'string') {
        data = type + ',' + resData;
      } else {
        data = 'application/json,' + JSON.stringify(resData);
      }

      if(open) {
        const w = window.open();
        w.location.href = 'data:' + data;
      } else
        return new Blob([data.slice(data.indexOf(',') + 1)], { type: data.slice(0, data.indexOf(',')) });
    },
    async download() {
      if(this.working)
        return;
      this.working = true;
      this.progress = 0;

      const items: string[] = [];
      for(const k in this.active) if(this.active[k] === true)
        items.push(k.startsWith('/') ? k.slice(1) : k);

      let allItems: string[] = [];
      for(const i of items) {
        allItems = allItems.concat(this.bigList
          .filter(a => a.startsWith((this.dir ? this.dir + '/' : '') + i))
          .map(a => this.dir.length ? a.slice(this.dir.length + 1) : a));
      }

      if(allItems.length === 1) {
        FileSaver.saveAs(await this.openFile(allItems[0], false), items[0]);
        this.workingOn = '';
        this.working = false;
        return;
      }

      const zip = new JSZip();
      for(let n = 0, it = allItems[n]; n < allItems.length; n++, it = allItems[n]) {
        console.log('download:', it);
        this.progress = n / allItems.length;
        this.workingOn = 'Zipping ' + it;
        await timeout();
        zip.file(it, await this.openFile(it, false));
      }
      this.progress = 1;
      this.workingOn = 'Serving the Zip';
      const blob = await zip.generateAsync({ type: 'blob' });
      const name = items.length === 1 ?
      this.annotations[items[0]] || items[0] :
      this.splitDir[this.splitDir.length - 1];
      FileSaver.saveAs(blob, name.replace('*', ''));
      this.workingOn = '';
      this.working = false;
    },
    lookupApp() {
      if(this.working)
        return;
      this.working = true;
      this.workingOn = 'Looking up app...';

      this.$buefy.dialog.prompt({
        message: 'App domain:',
        inputAttrs: {
          type: 'url',
          placeholder: 'https://helloblockstack.com/'
        },
        onConfirm: async value => {
          if(!value.startsWith('http'))
            value = 'https://' + value;

          let app: {
            website: string;
            name: string;
            address: string;
            privateKey: string;
          };
          try {
            app = this.makeApp({ website: value });
          } catch(e) {
            this.$buefy.dialog.alert({
              type: 'is-danger',
              message: 'Could not create an app from website "' + value + '"!'
            });
            this.working = false;
            this.workingOn = '';
            return;
          }
          if(!app) {
            this.$buefy.dialog.alert({
              type: 'is-info',
              message: 'App already listed!'
            });
            this.working = false;
            this.workingOn = '';
            return;
          }
          if(app && !this.apps.find(a => a.address === app.address))
            this.apps.push(app);
          let hubInfo;
          try {
            const res = await axios.get(this.activeGaia.server + '/hub_info');
            hubInfo = res.data;
          } catch(e) {
            this.$buefy.dialog.alert({
              type: 'is-danger',
              message: 'Could not get hub info from active gaia hub "' + this.activeGaia.server + '"!'
            });
            this.working = false;
            this.workingOn = '';
            return;
          }
          let files: string[];
          try {
            files = await this.listFilesSingle(app, hubInfo, this.activeGaia.server);
          } catch(e) {
            this.$buefy.dialog.alert({
              type: 'is-danger',
              message: 'Could not create list files from address "' + app.address + '"!'
            });
            this.working = false;
            this.workingOn = '';
            return;
          }
          const filteredFiles = files.filter(a => !this.bigList.includes(a));
          if(filteredFiles.length) {
            this.bigList = [ ...this.bigList, ...files.filter(a => !this.bigList.includes(a)) ].sort();
            this.$store.commit('setBigListCache', this.bigList);
          } else if(files.length) {
            this.$buefy.dialog.alert({
              type: 'is-info',
              message: 'No *new* files from "' + app.name + '" to be listed!'
            });
          } else {
            this.$buefy.dialog.alert({
              type: 'is-info',
              message: 'No files from "' + app.name + '" to be listed!'
            });
          }

          this.working = false;
          this.workingOn = '';
        },
        onCancel: () => {
          this.working = false;
          this.workingOn = '';
        }
      });
    },
    drawStart(event: MouseEvent) {
      if(event.button !== 0)
        return;

      this.drawing = true;
      Vue.set(this.drawBegin, 'x', event.x);
      Vue.set(this.drawBegin, 'y', event.y);
      this.drawPoints = { x1: event.x, x2: event.x, y1: event.y, y2: event.y };
      this.drawPos = { top: event.y + 'px', left: event.x + 'px', height: 0 + 'px', width: 0 + 'px' };
    },
    boxInside(
      a: { x1: number, y1: number, x2: number, y2: number },
      b: { x1: number, y1: number, x2: number, y2: number }) {
      return !(a.x1 > b.x2 ||
              a.x2 < b.x1 ||
              a.y1 > b.y2 ||
              a.y2 < b.y1);
    },
    drawContinue: _.throttle(function(this, event: MouseEvent) {
      if(!this.drawing) return;
      Vue.set(this.drawPoints, 'y1', Math.min(event.y, this.drawBegin.y)); // top
      Vue.set(this.drawPoints, 'x1', Math.min(event.x, this.drawBegin.x)); // left
      Vue.set(this.drawPoints, 'y2', Math.max(event.y, this.drawBegin.y)); // bottom
      Vue.set(this.drawPoints, 'x2', Math.max(event.x, this.drawBegin.x)); // right

      Vue.set(this.drawPos, 'top', this.drawPoints.y1 + 'px');
      Vue.set(this.drawPos, 'left', this.drawPoints.x1 + 'px');
      Vue.set(this.drawPos, 'height', this.drawPoints.y2 - this.drawPoints.y1 + 'px');
      Vue.set(this.drawPos, 'width', this.drawPoints.x2 - this.drawPoints.x1 + 'px');

      const children = (this.$refs.explorer as HTMLElement).children;

      for(let i = 0, child = children.item(i); i < children.length; i++, child = children.item(i)) {
        if(!(child.classList.contains('folder') || child.classList.contains('file')))
          continue;

        const box = child.getBoundingClientRect();
        const b = {
          x1: box.left,
          y1: box.top,
          x2: box.right,
          y2: box.bottom
        };

        if(this.boxInside(b, this.drawPoints))
          child.classList.add('hover');
        else if(child.classList.contains('hover'))
          child.classList.remove('hover');
      }
    }, 15), // a little over 60 per second
    drawEnd(event: MouseEvent, hard?: boolean) {
      if(!this.drawing || event.button !== 0)
        return;

      this.drawing = false;
      const children = (this.$refs.explorer as HTMLElement).children;

      const newActive = [];
      for(let i = 0, child = children.item(i); i < children.length; i++, child = children.item(i)) {
        if(!(child.classList.contains('folder') || child.classList.contains('file')))
          continue;

        if(child.classList.contains('hover')) {
          const itemMatch = /m-(.+)/.exec(child.id);
          if(itemMatch && itemMatch[1])
            newActive.push(itemMatch[1]);
          child.classList.remove('hover');
        }
      }

      if(!(event.getModifierState('State') || event.shiftKey))
        this.active = { };
      for(const i of newActive)
        Vue.set(this.active, i, true);
    }
  }
});
