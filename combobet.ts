import axios from 'axios';
import { getUserInputYN } from './utils/input';
import { ethers } from 'ethers'
import { config } from 'dotenv';
import USDT_PROXY_ABI from './abis/usdt-proxy-abi.json';
import AZURO_PROXY_ABI from './abis/azuro-proxy-abi.json'
config();

// FILL IN VALUES HERE
const USDT_TO_BET = "0.1" // Amount of USDT to bet
const AFFILIATE = "0x3121e8d2a4f0F220e8C7C7c6D9a7046527A54B19"; // Azuro Revenue Share Wallet
// bet #1
const CONDITION_ID1 = "100100000000000015814974340000000000000267367374"; // Azuro Game Market Variables from the subgraph
const OUTCOME_ID1 = "7759"; // Azuro Game Market Variables from the subgraph
// bet #2
const CONDITION_ID2 = "100100000000000015814974290000000000000267363108"; // Azuro Game Market Variables from the subgraph
const OUTCOME_ID2 = "7763"; // Azuro Game Market Variables from the subgraph

const USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' // USDT Proxy contract on Polygon
const LP_ADDRESS = '0x7043E4e1c4045424858ECBCED80989FeAfC11B36' // Azuro LP contract on Polygon
const EXPRESS_ADDRESS = '0x92a4e8Bc6B92a2e1ced411f41013B5FE6BE07613' // Azuro BetExpress contract on Polygon
const PROXY_ADDRESS = '0x200BD65A3189930634af857C72281abE63C3da5e' // Azuro ProxyFront contract on Polygon
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY!);

// Contract Interfaces
const azuroProxyInterface = new ethers.Interface(AZURO_PROXY_ABI);
const usdtProxyInterface = new ethers.Interface(USDT_PROXY_ABI);

// Set up the axios client
const axiosClient = axios.create({
  baseURL: process.env.PEAZE_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': process.env.PEAZE_API_KEY, 
  },
});

async function main() {

  console.log('\n' + '-'.repeat(60));
  console.log(`Azuro combo-bet on Polygon`);
  console.log('-'.repeat(60) + '\n');

  console.log('Getting tx estimate...\n');

  const betAmount = ethers.parseUnits(USDT_TO_BET, 6);
  const deadline = Math.floor(Date.now() / 1000) + 2000;

  const selections: {}[] = [
    [CONDITION_ID1, OUTCOME_ID1],
    [CONDITION_ID2, OUTCOME_ID2]
  ];

  const betData = ethers.AbiCoder.defaultAbiCoder().encode(
    [ 'tuple(uint256, uint64)[]' ], 
    [ selections ]
  );

  const encodedBet = azuroProxyInterface.encodeFunctionData('bet', [
    LP_ADDRESS,
    [
      {
        core: EXPRESS_ADDRESS, 
        amount: betAmount,
        expiresAt: deadline,
        extraData: {
          affiliate: AFFILIATE, 
          minOdds: 0, 
          data: betData
        }
      }
    ]
  ])

  const betTx = {
    to: PROXY_ADDRESS,
    data: encodedBet
  };

  const approvalTx = {
    to: USDT_ADDRESS,
    data: usdtProxyInterface.encodeFunctionData('approve', [
      PROXY_ADDRESS,
      betAmount
    ])
  };

  // Send request to Peaze /estimate endpoint to fetch `quote` and `costSummary`
  const { data } = await axiosClient.post('/single-chain/estimate', {
    sourceChain: 137,
    sourceToken: USDT_ADDRESS,
    userAddress: wallet.address,
    tokenAmount: betAmount.toString(),
    transactions: [approvalTx, betTx],
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

  // Generate signatures by signing message from Peaze /estimate endpoing response
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
    const errorMsg = e.response?.data?.message ?? `${e}`;
    const errorDetails = JSON.stringify(e.response?.data?.data, null, 2);
  
    console.log('We got an error');
    console.log(errorMsg);
    if (errorDetails) console.log(`Error details:\n${errorDetails}`);
    process.exit(1);
  });