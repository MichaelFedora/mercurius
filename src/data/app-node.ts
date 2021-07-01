import { shaThis } from '@/crypto';
import { BIP32Interface } from 'bip32';
import { payments } from 'bitcoinjs-lib';
import { WrappedNode } from './wrapped-node';

export function hashCode(string) {
  let hash = 0;
  if (string.length === 0) return hash;
  for (let i = 0; i < string.length; i++) {
    const character = string.charCodeAt(i);
    hash = (hash << 5) - hash + character;
    hash = hash & hash;
  }
  return hash & 0x7fffffff;
}

export class AppNode extends WrappedNode {

  private _appDomain: string;

  constructor(node: BIP32Interface | WrappedNode, appDomain: string) {
    super(node);
    this._appDomain = appDomain;
  }

  static fromAppsNode(appsNode: BIP32Interface | WrappedNode, salt: string, appDomain: string) {
    const hash = shaThis(`${appDomain}${salt}`);
    const appIndex = hashCode(hash);
    return new AppNode(appsNode.deriveHardened(appIndex), appDomain);
  }

  get appDomain() { return this._appDomain; }

  get appPrivateKey() {
    // @ts-ignore
    return this.keyPair.privateKey.toString('hex');
  }

  get address() {
    return payments.p2pkh({ pubkey: this.publicKey }).address;
  }
}

export default AppNode;
