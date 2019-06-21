import Vue from 'vue';
import { VVue } from '../../vvue';
import Axios from 'axios';

import _ from 'lodash';
import { mapGetters } from 'vuex';
import { GaiaHubConfig } from 'blockstack/lib/storage/hub';
import WrappedKeychain from 'data/wrapped-keychain';
import { decryptECIES } from 'blockstack/lib/encryption';
import { makeV1GaiaAuthToken } from 'util/token-util';
import JSZip from 'jszip';
import FileSaver from 'file-saver';
import defaultApps from '../../data/apps-defaults';

const CIPHER_OBJ_KEYS = ['iv', 'ephemeralPK', 'cipherText', 'mac', 'wasString'];
const MORE_APPS = [
  { name: 'Graphite (App)**', website: 'https://app.graphitedocs.com' },
  { name: 'XOR Drive**', website: 'https://xordrive.io' }
];

export default (Vue as VVue).component('mercurius-home', {
  data() {
    return {
      working: false,
      progress: 0,
      workingOn: '',
      dir: '',

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
    handleError(err: Error) {
      console.error(err);
      this.$dialog.alert({ title: 'error', type: 'error', message: 'Error: ' + err.message, });
    },
    async listBucketFiles(gaiaHubConfig: GaiaHubConfig) {
      const headers = { Authorization: 'bearer ' + gaiaHubConfig.token };
      const bigList = [];
      let page;

      do {
        let url = gaiaHubConfig.server + '/list-files/' + gaiaHubConfig.address;
        if(page)
          url += '?page=' + page;
        const res = await Axios.post(url, null, { headers });

        if(res.data.page)
          page = res.data.page;
        else
          page = 0;

        bigList.push(...res.data.entries);
      } while(page && await new Promise(resolve => setTimeout(() => resolve(true), 500)));

      return bigList;
    },
    async getApps() {
      const newApps: { name: string, website: string, address: string, privateKey: string }[] = [];

      if(!this.apps || this.apps.length === 0)
        this.apps = newApps;

      this.workingOn = 'Getting all available apps';
      this.annotations = { [this.activeGaia.address]: 'User' };

      const evenMoreExtraApps: { name: string, website: string }[] = [];

      try {
        const r = await Axios.get(this.activeGaia.url_prefix + this.activeGaia.address + '/profile.json');
        const a = r.data[0].decodedToken.payload.claim.apps as { [key: string]: string };
        for(const k in a) if(a[k]) evenMoreExtraApps.push({ name: k.replace(/https?:\/\//, ''), website: k });
      } catch(e) {
        console.warn('Issue getting profile: ', e);
      }

      const appsNode = this.masterKeychain.getIdentityOwnerAddressNode(0).appsNode;
      // const res = await Axios.get('https://api.app.co/api/app-mining-apps'); // other one is WAY too large
      let res;
      try {
        res = await Axios.get('https://api.app.co/api/apps'); // other one is WAY too large
      } catch(e) {
        this.handleError(e);
        this.workingOn = '';
      }
      const apps: { name: string, website: string }[] = res.data.apps.filter(a =>
        (a.storageNetworkID === 0 || a.storageNetwork === 'Gaia') &&
        (a.authenticationID === 0 || a.authentication === 'Blockstack'))
        .concat(defaultApps.apps.map(a => ({ name: a.name + '*', website: a.launchLink })))
        .concat(evenMoreExtraApps)
        .concat(MORE_APPS);

      for(const app of apps) {
        const node = appsNode.getAppNode(app.website);

        if(this.annotations[node.getAddress()])
          continue;

        Vue.set(this.annotations, node.getAddress(), app.name);

        newApps.push({
          name: app.name,
          website: app.website,
          address: node.getAddress(),
          privateKey: node.privateKey.toString('hex')
        });

        this.apps = newApps;
        this.$store.commit('setAppCache', newApps);

        this.workingOn = '';
      }
    },
    async listFiles() {
      this.progress = 0;
      await this.getApps();
      const hubInfo: {
        challenge_text: string,
        latest_auth_version: string,
        read_url_prefix: string
      } = (await Axios.get(this.activeGaia.server + '/hub_info')).data;
      const server = this.activeGaia.server;

      const bigList: string[] = [];
      if(!this.bigList || this.bigList.length === 0)
        this.bigList = bigList;

      for(let i = 0, app = this.apps[i]; i < this.apps.length; i++, app = this.apps[i]) {
        try {
          this.workingOn = 'Looking up ' + app.name + '\'s app bucket (' + i + '/' + this.apps.length + ')';

          const gc: GaiaHubConfig = { // optimized so we don't spam hub_info as well as /list-files
            url_prefix: hubInfo.read_url_prefix,
            address: app.address,
            token: makeV1GaiaAuthToken(hubInfo, app.privateKey, server),
            server
          };
          const list = await this.listBucketFiles(gc);

          if(list.length)
            bigList.push(...list.map(a => app.address + '/' + a));
          this.progress += 1 / (this.apps.length + 1);
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch(e) {
          console.error('Error listing files for app ' + app.name + '!');
          console.error(e);
        }
      }

      this.workingOn = 'Getting profile app bucket';
      const myList = await this.listBucketFiles(this.activeGaia);
      bigList.push(...myList.map(a => this.activeGaia.address + '/' + a));
      this.annotations[this.activeGaia.address] = 'User';

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
          item.startsWith('/') ? this.openFolder(item.slice(1)) : this.openFile(item);
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
    async openFile(file: string, open: boolean = true) {
      const url = this.activeGaia.url_prefix + (this.dir ? this.dir + '/' : '') + file;
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

      const res = await Axios.get(url);
      if(pk && this.isDecipherable(res.data)) {

        data = (file.endsWith('.json') ? 'application/json,' : ',') + decryptECIES(pk, res.data);
      } else {
        data = typeof res.data === 'string' ? ',' + res.data : 'application/json,' + JSON.stringify(res.data);
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
        await new Promise(resolve => setTimeout(resolve, 500));
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
