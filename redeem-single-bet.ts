import axios from 'axios';
import { getUserInputYN } from './utils/input';
import { ethers } from 'ethers'
import { config } from 'dotenv';
import LP_ABI from './abis/azuro-lp-abi.json';
config();

// FILL IN VALUES HERE 
const BET_ID = "38325";

const USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' // USDT contract on Polygon
const LP_ADDRESS = '0x7043E4e1c4045424858ECBCED80989FeAfC11B36' // Azuro LP contract on Polygon
const PREMATCH_CORE_ADDRESS = '0xA40F8D69D412b79b49EAbdD5cf1b5706395bfCf7' // Azuro PrematchCore contract on Polygon
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY!); // User whose wallet is redeeming the bet 

const lpInterface = new ethers.Interface(LP_ABI);

const axiosClient = axios.create({
  baseURL: process.env.PEAZE_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': process.env.PEAZE_API_KEY, 
  },
});

async function main() {
  
  console.log('\n' + '-'.repeat(60));
  console.log(`Azuro redeem single-bet on Polygon`);
  console.log('-'.repeat(60) + '\n');

  console.log('Getting tx estimate...\n');

  const encodedWithdraw = lpInterface.encodeFunctionData('withdrawPayout', [
    PREMATCH_CORE_ADDRESS, 
    BET_ID
  ]);
  
  const withdrawTx = {
    to: LP_ADDRESS,
    data: encodedWithdraw
  };

  // Send request to Peaze /estimate endpoint to fetch `quote` and `costSummary`
  const { data } = await axiosClient.post('/single-chain/estimate', {
    sourceChain: 137,
    sourceToken: USDT_ADDRESS,
    userAddress: wallet.address,
    tokenAmount: ethers.parseUnits("0", 6).toString(),
    transactions: [withdrawTx],
    expectedERC20Tokens: [], 
  });

  const { quote, costSummary } = data;

  console.log(`Cost summary: ${JSON.stringify(costSummary, null, 2)}`);
  console.log(`Total cost (tx amount + gas + fee) : ${costSummary.totalAmount} USDT\n`);

  const shouldExecute = await getUserInputYN(
    'Would you like to sign and execute the tx? (y/n): ',
  );
  if (!shouldExecute) return;

  const { fundingTypedData, peazeTypedData } = quote;

  // Sign messages from Peaze /estimate response
  const signatures = {
    fundingSignature: await wallet.signTypedData(
      fundingTypedData.domain,
      fundingTypedData.types,
      fundingTypedData.message,
    ),
    peazeSignature: await wallet.signTypedData(
      peazeTypedData.domain,
      peazeTypedData.types,
      peazeTypedData.message,
    ),
  };

  console.log('\nExecuting transaction...\n');

  // Send request to Peaze /execute endpoint to submit the transaction
  const executeResponse = await axiosClient.post('/single-chain/execute', {
      quote,
      signatures,
  });

  console.log(`Transaction submitted:\n${JSON.stringify(executeResponse.data, null, 2)}\n`);
}

main().catch(e => {
  console.log({ e });

  const errorMsg = e.response?.data?.message ?? `${e}`;
  const errorDetails = JSON.stringify(e.response?.data?.data, null, 2);

  console.log('We got an error');
  console.log(errorMsg);
  if (errorDetails) console.log(`Error details:\n${errorDetails}`);
  process.exit(1);
});