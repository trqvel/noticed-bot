import { ethers } from "ethers";
import { Telegraf } from "telegraf";
import fs from "fs/promises";
import { providerConfigs } from "./config.network.js";

const BOT_TOKEN = '';
const CHAT_ID = '';
const walletFilePath = 'wallet.txt';

const providerInstances = Object.entries(providerConfigs).map(([network, config]) => {
  return {
    network,
    provider: new ethers.providers.JsonRpcProvider({
      url: config.url,
      network: network
    })
  };
});

const bot = new Telegraf(BOT_TOKEN);

let lastBlockPerNetwork = {};

const readWalletsFromFile = async () => {
  try {
    const data = await fs.readFile(walletFilePath, 'utf-8');
    return data.split('\n').map(line => line.trim()).filter(address => ethers.utils.isAddress(address));
  } catch (error) {
    console.error('Error reading wallet file:', error);
    return [];
  }
};

const checkForTransactions = async (provider, walletAddress) => {
  const currentBlock = await provider.provider.getBlockNumber();

  const lastBlockKey = `${provider.network}-${walletAddress}`;

  if (lastBlockPerNetwork[lastBlockKey] && currentBlock === lastBlockPerNetwork[lastBlockKey]) {
    console.log(`No new blocks on ${provider.network} since last check for ${walletAddress}.`);
    return;
  }

  console.log(`New block detected on ${provider.network} for ${walletAddress}:`, currentBlock);

  const block = await provider.provider.getBlockWithTransactions(currentBlock);

  if (block && block.transactions) {
    const transactions = block.transactions.filter(tx => tx.from.toLowerCase() === walletAddress.toLowerCase());
    if (transactions.length > 0) {
      console.log(`New transactions on ${provider.network} involving wallet ${walletAddress}:`, transactions.length)

      transactions.forEach(tx => {
        const transactionType = "outgoing";
        const otherAddress = tx.to;
        const text = `New ${transactionType} transaction from wallet: ${walletAddress} to ${provider.network}!
          Hash: ${tx.hash}
          Value: ${ethers.utils.formatEther(tx.value)} ETH
          Other Wallet: ${otherAddress}`;
        console.log('Sending message:', text);

        bot.telegram.sendMessage(CHAT_ID, text)
          .then(() => console.log('Message sent successfully'))
          .catch(error => console.error('Error sending message:', error));
      });
    }
  }

  lastBlockPerNetwork[lastBlockKey] = currentBlock;
  console.log(`Transaction check on ${provider.network} for ${walletAddress} complete.`);
};

bot.launch();

setInterval(async () => {
  try {
    const wallets = await readWalletsFromFile();
    console.log(`Checking for transactions on ${wallets.length} addresses:`, wallets)

    for (const wallet of wallets) {
      console.log(`Checking transactions for wallet:`, wallet)
      for (const provider of providerInstances){
        console.log(`Checking transactions on ${provider.network} for`, wallet);
        await checkForTransactions(provider, wallet);
      }
    }
  } catch (error) {
    console.error('Error checking for transactions:', error);
  }
}, 10000);