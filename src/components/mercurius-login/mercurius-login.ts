import Vue from 'vue';
import { FieldFlags } from 'vee-validate';
import { validateMnemonic, mnemonicToSeed } from 'bip39';
import { mapGetters } from 'vuex';
import { VVue } from '../../vvue';
import { bip32 } from 'bitcoinjs-lib';
import { connectToGaiaHub } from 'blockstack';

export default (Vue as VVue).component('mercurius-login', {
  props: {
    done: { required: false, type: Boolean },
  },
  data() {
    return {
      error: '',
      mnemonic: ''
    };
  },
  computed: {
    ...mapGetters({
      loggedIn: 'isLoggedIn'
    })
  } as { loggedIn: () => boolean },
  mounted() {
    if(this.loggedIn)
      this.$emit('update:done', true);
    else
      this.$emit('update:done', false);
  },
  watch: {
    loggedIn(n) {
      if(!n) {
        this.$emit('update:done', false);
      }
    }
  },
  methods: {
    getType(field: FieldFlags, ignoreTouched?: boolean) {
      if(!field || (!field.dirty && (ignoreTouched || !field.touched))) return '';
      if(field.valid) return 'is-success';
      return 'is-danger';
    },
    async initialize() {
      console.log('Initializing...');
      console.log('Initialized!');
    },
    login() {
      console.log('Logging in!');
      this.$emit('working', true);

      if(!validateMnemonic(this.mnemonic)) {
        console.error(this.error = 'Invalid keychain phrase entered!');
        this.$emit('error', this.error);
        this.$emit('working', false);
        return;
      }

      // TODO: get addresses from name and profile.json
      mnemonicToSeed(this.mnemonic)
        .then(seed => this.$store.commit('login', bip32.fromSeed(seed)))
        .then(async () => this.$store.commit('addGaia',
                            await connectToGaiaHub('https://hub.blockstack.org',
                              this.$store.getters.masterKeychain.getIdentityOwnerAddressNode(0).privateKey.toString('hex'))))
        .then(() => this.finish())
        .catch(err => {
        console.error('Error logging in:', err);
        this.$emit('error', this.error);
        this.$emit('working', false);
      });
    },
    finish() {
      this.$emit('update:done', true);
      this.$emit('working', false);
    }
  }
});
