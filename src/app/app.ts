import Vue from 'vue';
import {  mapGetters } from 'vuex';
import { VVue } from '../vvue';
import { GaiaHubConfig } from 'blockstack/lib/storage/hub';

export default (Vue as VVue).extend({
  data() {
    return {
      showMenu: false,
    };
  },
  computed: {
    ...mapGetters({
      loggedIn: 'isLoggedIn',
      activeGaia: 'activeGaiaStore'
    }) as { loggedIn: () => boolean, activeGaia: () => GaiaHubConfig },

    userdata(): {
      username: string;
      address: string;
      profile: any;
    } {
      return this.loggedIn ? this.$store.state.userdata : null;
    },
    name(): string {
      return this.getProfileName(this.userdata, true);
    },
    avatar(): string {
      return (this.userdata &&
          this.userdata.profile &&
          this.userdata.profile.image &&
          this.userdata.profile.image[0]) ?
          this.userdata.profile.image[0].contentUrl : '';
    },
    hub(): string {
      return this.activeGaia ? this.activeGaia.server : '{null}';
    }
  },
  methods: {
    getProfileName(user: { username: string, address: string, profile: any }, noFallback?: boolean) {
      if(!user) return `{null}`;
      if(user.username) return user.username;
      if(user.profile && user.profile.name) return user.profile.name;
      if(!noFallback) return `ID-${user.address}`;
    },
    logout() {
      this.showMenu = false;
      this.$store.commit('logout');
    }
  }
});
