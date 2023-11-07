import axios from 'axios';
import { getUserInputYN } from './utils/input';
import { ethers } from 'ethers'
import { config } from 'dotenv';
import LP_ABI from './abis/azuro-lp-abi.json';
import PROXY_ABI from './abis/azuro-proxy-abi.json';
import USDT_ABI from './abis/usdt-abi.json';
import USDT_PROXY_ABI from './abis/usdt-proxy-abi.json';
config();

const SRC_CHAIN_ID = 137; // Polygon
const DST_CHAIN_ID = 137; // Polygon
const USDT_TO_BET = process.env.USDT_TO_BET!;
const USDT_PROXY_ADDRESS = '0x7FFB3d637014488b63fb9858E279385685AFc1e2' // USDT Proxy contract on Polygon
const USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' // USDT contract on Polygon
const LP_ADDRESS = '0x7043E4e1c4045424858ECBCED80989FeAfC11B36' // Azuro LP Proxy contract on Polygon
const CORE_ADDRESS = '0xA40F8D69D412b79b49EAbdD5cf1b5706395bfCf7' // Azuro PrematchCore contract on Polygon
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY!);

// Contract Interfaces
const lpInterface = new ethers.Interface(LP_ABI);
const usdtInterface = new ethers.Interface(USDT_ABI);
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

  // Azuro Game Market Variables from the subgraph

  const conditionId: any = "100100000000000015811616850000000000000263423119";
  const outcomeId: any = "2361";
  const currentOdds: any = "1.835601489481";

  // Bet variables
  const betAmount = ethers.parseUnits(USDT_TO_BET, 6);
  const deadline = Math.floor(Date.now() / 1000) + 2000;
  const affiliate = "0x3121e8d2a4f0F220e8C7C7c6D9a7046527A54B19"; // BookieBot Revenue Share Wallet
  const minOdds = calculateMinOdds(currentOdds);

  const encodedBetData = ethers.AbiCoder.defaultAbiCoder().encode(
    [ 'uint256', 'uint64' ],
    [ conditionId, outcomeId ]
  );
  
  const encodedBet = lpInterface.encodeFunctionData('betFor', [
    wallet.address,
    CORE_ADDRESS, 
    betAmount, 
    deadline, 
    {
     affiliate,
     data: encodedBetData,
     minOdds: minOdds, 
    }
  ]);
  
  const betTx = {
    to: LP_ADDRESS,
    data: encodedBet
  }
  console.log('about to approve tx')
  const approvalTx = {
    to: USDT_ADDRESS,
    data: usdtProxyInterface.encodeFunctionData('approve', [
      LP_ADDRESS,
      betAmount
    ])
  };
  console.log('approved')
  const { data } = await axiosClient.post('/single-chain/estimate', {
    sourceChain: SRC_CHAIN_ID,
    destinationChain: DST_CHAIN_ID,
    sourceToken: USDT_ADDRESS,
    userAddress: wallet.address,
    tokenAmount: betAmount.toString(),
    transactions: [approvalTx, betTx],
    expectedERC20Tokens: [], 
  });

  return data;
}

async function main() {
  console.log('-'.repeat(60));
  console.log(`Azuro Protocol tx on Polygon`);
  console.log('-'.repeat(60) + '\n');

  console.log('Getting tx estimate...' + '\n');
  const { quote, costSummary } = await singleBetEstimateTx();
  console.log(`Quote data:\n${JSON.stringify(quote, null, 2)}\n`);

  // Show transaction cost summary and prompt user to sign and proceed
  const totalCost: number = costSummary.totalAmount;
  console.log(`Total cost (tx amount + gas + fees): ${totalCost} USDT\n`);

  const shouldExecute = await getUserInputYN(
    'Would you like to sign and execute the tx? (y/n) ',
  );
  if (!shouldExecute) return;

  const { fundingTokenTypedData, peazeTypedData } = quote;
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

  console.log('Executing transaction...');
  const { data } = await axiosClient.post('/single-chain/execute', {
    quote,
    signatures,
  });

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