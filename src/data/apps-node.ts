import { BIP32Interface } from 'bip32';
import { AppNode, hashCode } from './app-node';
import { shaThis } from '@/crypto';
import { WrappedNode } from './wrapped-node';

export class AppsNode extends WrappedNode {
  private _salt: string;

  constructor(node: BIP32Interface, salt: string) {
    super(node);
    this._salt = salt;
  }

  get salt() { return this._salt; }

  getAppNode(appDomain: string) {
    const hash = shaThis(`${appDomain}${this.salt}`);
    const appIndex = hashCode(hash);
    return new AppNode(this.node.deriveHardened(appIndex), appDomain);
  }
}

export default AppsNode;
