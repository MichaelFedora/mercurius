import { payments } from 'bitcoinjs-lib';
import { ECPairInterface, ECPairFactory } from 'ecpair';
import { BIP32Interface } from 'bip32';
import { ecPairToHexString, hexStringToECPair, ecPairToAddress, BlockstackWallet } from 'blockstack';
import { BlockstackNetwork } from 'blockstack/lib/network';
import * as bip39 from 'bip39';
const { validateMnemonic, mnemonicToSeed } = bip39;

import * as tiny from 'tiny-secp256k1';

export const ECPair = ECPairFactory(tiny);

// from cli and very messy
function getNodePrivateKey(node: BIP32Interface | ECPairInterface) {
  return ecPairToHexString(ECPair.fromPrivateKey(node.privateKey));
}

// from cli and very messy
function getPrivateKeyAddress(network: BlockstackNetwork, privateKey: string | { signerVersion: any, address: string }) {
  if(typeof privateKey === 'object' && privateKey.signerVersion != null) {
    return privateKey.address;
  } else {
    const ecKeyPair = hexStringToECPair('' + privateKey);
    return network.coerceAddress(ecPairToAddress(ecKeyPair));
  }
}

export async function getInfo(network: BlockstackNetwork, mnemonic: string) {
  if(!validateMnemonic(mnemonic))
    throw new Error('Not a valid mnemonic!');

  const seed = await mnemonicToSeed(mnemonic);
  const wallet = BlockstackWallet.fromSeedBuffer(seed);

  const identity: BIP32Interface = wallet.getIdentityAddressNode(0);
  const address = network.coerceAddress(BlockstackWallet.getAddressFromBIP32Node(identity));
  const key = getNodePrivateKey(ECPair.fromPrivateKey(identity.privateKey));

  return { address, key };
}

export function getAddress(node: BIP32Interface, network?: any) {
  return payments.p2pkh({ pubkey: node.publicKey }).address;
}
