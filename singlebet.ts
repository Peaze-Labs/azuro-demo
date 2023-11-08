import axios from 'axios';
import { getUserInputYN } from './utils/input';
import { ethers } from 'ethers'
import { config } from 'dotenv';
import LP_ABI from './abis/azuro-lp-abi.json';
import USDT_PROXY_ABI from './abis/usdt-proxy-abi.json';
config();

// FILL IN VALUES HERE 
const USDT_TO_BET = "0.01"; // Amount of USDT to bet
const AFFILIATE = "0x3121e8d2a4f0F220e8C7C7c6D9a7046527A54B19"; // Azuro Revenue Share Wallet
const CONDITION_ID = "100100000000000015808653660000000000000261232597"; // Azuro Game Market Variables from the subgraph
const OUTCOME_ID = "10"; // Azuro Game Market Variables from the subgraph
const CURRENT_ODDS = "1.974126959136"; // Azuro Game Market Variables from the subgraph

const USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' // USDT contract on Polygon
const LP_ADDRESS = '0x7043E4e1c4045424858ECBCED80989FeAfC11B36' // Azuro LP contract on Polygon
const CORE_ADDRESS = '0xA40F8D69D412b79b49EAbdD5cf1b5706395bfCf7' // Azuro PrematchCore contract on Polygon
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY!); // Wallet to bet with

const lpInterface = new ethers.Interface(LP_ABI);
const usdtProxyInterface = new ethers.Interface(USDT_PROXY_ABI);

const axiosClient = axios.create({
  baseURL: process.env.PEAZE_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': process.env.PEAZE_API_KEY, 
  },
});

function calculateMinOdds(currentOdds: any) {
  const slippage = 4; 
  const minimumOdds = 1 + ((currentOdds - 1) * (100 - slippage)) / 100;
  const oddsDecimals = 12;
  const minOdds = ethers.parseUnits(
    minimumOdds.toFixed(oddsDecimals),
    oddsDecimals
  );
  return minOdds;
}

async function singleBetEstimateTx() {

  const betAmount = ethers.parseUnits(USDT_TO_BET, 6);
  const deadline = Math.floor(Date.now() / 1000) + 2000;
  const minOdds = calculateMinOdds(CURRENT_ODDS);

  const betData = ethers.AbiCoder.defaultAbiCoder().encode(
    [ 'uint256', 'uint64' ],
    [ CONDITION_ID, OUTCOME_ID ]
  );
  
  const encodedBet = lpInterface.encodeFunctionData('betFor', [
    wallet.address,
    CORE_ADDRESS, 
    betAmount, 
    deadline, 
    {
     affiliate: AFFILIATE,
     data: betData,
     minOdds: minOdds, 
    }
  ]);
  
  const betTx = {
    to: LP_ADDRESS,
    data: encodedBet
  }
  
  const approvalTx = {
    to: USDT_ADDRESS,
    data: usdtProxyInterface.encodeFunctionData('approve', [
      LP_ADDRESS,
      betAmount
    ])
  };
  
  const { data } = await axiosClient.post('/single-chain/estimate', {
    sourceChain: 137,
    destinationChain: 137,
    sourceToken: USDT_ADDRESS,
    userAddress: wallet.address,
    tokenAmount: betAmount.toString(),
    transactions: [approvalTx, betTx],
    expectedERC20Tokens: [], 
  });

  return data;
}

async function singleBetExecuteTx({ quote, signatures }: { quote: any, signatures: any }) {

  const { data } = await axiosClient.post('/single-chain/execute', {
    quote,
    signatures,
  });

  return data;
}

async function main() {
  console.log('\n');
  console.log('-'.repeat(60));
  console.log(`Azuro Protocol tx on Polygon`);
  console.log('-'.repeat(60) + '\n');

  // Call singleBetEstimateTx() to fetch cost summary and messages
  console.log('Getting tx estimate...' + '\n');
  const { quote, costSummary } = await singleBetEstimateTx();
  console.log(`Cost summary:\n${JSON.stringify(costSummary, null, 2)}\n`);
  console.log(`Total cost (tx amount + gas + fees): ${costSummary.totalAmount} USDT\n`);

  const shouldExecute = await getUserInputYN(
    'Would you like to sign and execute the tx? (y/n) ',
  );
  if (!shouldExecute) return;

  const { fundingTokenTypedData, peazeTypedData } = quote;

  // Sign messages from singleBetEstimateTx() response to generate signatures
  const signatures = {
    fundingTokenSignature: await wallet.signTypedData(
      fundingTokenTypedData.domain,
      fundingTokenTypedData.types,
      fundingTokenTypedData.message,
    ),
    peazeSignature: await wallet.signTypedData(
      peazeTypedData.domain,
      peazeTypedData.types,
      peazeTypedData.message,
    ),
  };

  // Call singleBetExecuteTx() to execute the transaction
  console.log('Executing transaction...');
  const { data } = await singleBetExecuteTx({quote, signatures});

  console.log(`Transaction submitted:\n${JSON.stringify(data, null, 2)}\n`);
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