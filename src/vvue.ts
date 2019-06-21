import { Store, StoreOptions } from 'vuex';
import createPersistedState from 'vuex-persistedstate';
import Vue, { VueConstructor } from 'vue';
import { BIP32Interface } from 'bip32';
import { GaiaHubConfig } from 'blockstack/lib/storage/hub';
import WrappedKeychain from 'data/wrapped-keychain';
import { bip32 } from 'bitcoinjs-lib';

export interface StateType {
  bigListCache: string[];
  appCache: { name: string, website: string, address: string, privateKey: string }[];
  gaiaStores: GaiaHubConfig[];
  activeGaiaStore: number;
  _masterKeychain: string;
  identityIndex: number;
  userdata: { username: string, address: string, profile: any };
  storeBDay: number;
}

export function makeState(): StateType {
  return {
    bigListCache: [],
    appCache: [],
    gaiaStores: [],
    activeGaiaStore: 0,
    _masterKeychain: '',
    identityIndex: 0,
    userdata: null,
    storeBDay: Date.now()
  };
}

export const initialStore: StoreOptions<StateType> = {
  state: makeState(),
  getters: {
    'masterKeychain': (state) => new WrappedKeychain(bip32.fromBase58(state._masterKeychain)),
    'isLoggedIn': (state) => state._masterKeychain && state.gaiaStores.length,
    'storeAge': (state) => Date.now() - state.storeBDay,
    'activeGaiaStore': (state) => state.gaiaStores[state.activeGaiaStore],
    'identity': (state, getters) => (getters.masterKeychain as WrappedKeychain).getIdentityOwnerAddressNode(0)
  },
  mutations: {
    login(state, node: BIP32Interface) {
      state._masterKeychain = node.toBase58();
      const masterKeychain = new WrappedKeychain(node);
      state.userdata = { username: null, profile: null, address: masterKeychain.getIdentityOwnerAddressNode(0).getAddress() };
      state.activeGaiaStore = 0;
      state.identityIndex = 0;
    },
    logout(state) {
      state._masterKeychain = null;
      state.gaiaStores.splice(0);
      state.activeGaiaStore = 0;
      state.bigListCache = [];
    },
    setBigListCache(state, cache: string[]) {
      state.bigListCache = [...cache];
    },
    setAppCache(state, cache: any[]) {
      state.appCache = [...cache];
    },
    addGaia(state, config: GaiaHubConfig) {
      state.gaiaStores.push(config);
    },
    removeGaia(state, index: number) {
      if(index === 0)
        return;
      state.gaiaStores = state.gaiaStores.slice(0, index).concat(state.gaiaStores.slice(index + 1));
      if(state.activeGaiaStore === index)
        state.activeGaiaStore = 0;
      else if(!state.gaiaStores[state.activeGaiaStore])
        state.activeGaiaStore = 0;
    },
    setActiveGaia(state, index: number) {
      if(state.gaiaStores[index])
        state.activeGaiaStore = index;
    }
  },
  actions: {
    updateIdentity(store, identity: number) {
      // fetch profile, update bucket locations
    },
    login(store, mnemonicKey: string) {
      // do all login stuff here
      // get identity
    }
  },
  plugins: [ createPersistedState() ]
};

interface Vuee extends Vue {
  $store: Store<StateType>;
}

export type VVue = VueConstructor<Vuee>;
