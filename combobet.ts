import axios from 'axios';
import { getUserInputYN } from './utils/input';
import { ethers } from 'ethers'
import { config } from 'dotenv';
import LP_ABI from './abis/azuro-lp-abi.json';
import USDT_PROXY_ABI from './abis/usdt-proxy-abi.json';
config();

// FILL IN VALUES HERE
const USDT_TO_BET = "0.1" // Amount of USDT to bet
const AFFILIATE = "0x3121e8d2a4f0F220e8C7C7c6D9a7046527A54B19"; // Azuro Revenue Share Wallet
// bet #1
const CONDITION_ID1 = "100100000000000015814887710000000000000267121454"; // Azuro Game Market Variables from the subgraph
const OUTCOME_ID1 = "7629"; // Azuro Game Market Variables from the subgraph
const CURRENT_ODDS1 = "1.843697041733"; // Azuro Game Market Variables from the subgraph
// bet #2
const CONDITION_ID2 = "100100000000000015814887910000000000000267035449"; // Azuro Game Market Variables from the subgraph
const OUTCOME_ID2 = "4583"; // Azuro Game Market Variables from the subgraph
const CURRENT_ODDS2 = "1.794134472219"; // Azuro Game Market Variables from the subgraph

const USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' // USDT Proxy contract on Polygon
const LP_ADDRESS = '0x7043E4e1c4045424858ECBCED80989FeAfC11B36' // Azuro LP contract on Polygon
// const CORE_ADDRESS = '0xA40F8D69D412b79b49EAbdD5cf1b5706395bfCf7' // Azuro PrematchCore contract on Polygon
const EXPRESS_ADDRESS = '0x92a4e8Bc6B92a2e1ced411f41013B5FE6BE07613' // Azuro BetExpress contract on Polygon
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY!);

// Contract Interfaces
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

async function comboBetEstimateTx() {

  const selections: {}[] = [
    [CONDITION_ID1, OUTCOME_ID1],
    [CONDITION_ID2, OUTCOME_ID2]
  ];
  
  // Bet variables
  const betAmount = ethers.parseUnits(USDT_TO_BET, 6);
  const deadline = Math.floor(Date.now() / 1000) + 2000;
  const minOdds = calculateMinOdds(CURRENT_ODDS1);

  const betData = ethers.AbiCoder.defaultAbiCoder().encode(
    [ 'tuple(uint256, uint64)[]' ], 
    [ selections ]
  );

  const encodedBet = lpInterface.encodeFunctionData('betFor', [
    wallet.address, 
    EXPRESS_ADDRESS, 
    betAmount, 
    deadline, 
    {
      affiliate: AFFILIATE, 
      data: betData, 
      minOdds: minOdds
    }
  ]);

  const betTx = {
    to: LP_ADDRESS,
    data: encodedBet
  };

  const approvalTx = {
    to: USDT_ADDRESS,
    data: usdtProxyInterface.encodeFunctionData('approve', [
      LP_ADDRESS,
      betAmount
    ])
  };

  const { data } = await axiosClient.post('/single-chain/estimate', {
    sourceChain: 137,
    sourceToken: USDT_ADDRESS,
    userAddress: wallet.address,
    tokenAmount: betAmount.toString(),
    transactions: [approvalTx, betTx],
    expectedERC20Tokens: [], 
  });

  return data;
}

async function main() {
    console.log('\n' + '-'.repeat(60));
    console.log(`Azuro Protocol combo-bet on Polygon`);
    console.log('-'.repeat(60) + '\n');
  
    console.log('Getting tx estimate...' + '\n');
    const { quote, costSummary } = await comboBetEstimateTx();
    console.log(`Quote data:\n${JSON.stringify(quote, null, 2)}\n`);
  
    // Show transaction cost summary and prompt user to sign and proceed
    const totalCost: number = costSummary.totalAmount;
    console.log(`Total cost (tx amount + gas + fees): ${totalCost} USDC\n`);
  
    const shouldExecute = await getUserInputYN(
      'Would you like to sign and execute the tx? (y/n) ',
    );
    if (!shouldExecute) return;
  
    // const { metaTxTypedData, permitTypedData } = quote;
    // const signatures = {
    //   fundingTokenSignature: await wallet.signTypedData(
    //     metaTxTypedData.domain,
    //     metaTxTypedData.types,
    //     metaTxTypedData.message,
    //   ),
    //   permitSignature: await wallet.signTypedData(
    //     permitTypedData.domain,
    //     permitTypedData.types,
    //     permitTypedData.message,
    //   ),
    // };
  
    // console.log('Executing transaction...');
    // const { data } = await axiosClient.post('/single-chain/execute', {
    //   quote,
    //   signatures,
    // });
  
    // console.log(`Transaction submitted:\n${JSON.stringify(data, null, 2)}\n`);
  }
  
  main().catch(e => {
    const errorMsg = e.response?.data?.message ?? `${e}`;
    const errorDetails = JSON.stringify(e.response?.data?.data, null, 2);
  
    console.log('We got an error');
    console.log(errorMsg);
    if (errorDetails) console.log(`Error details:\n${errorDetails}`);
    process.exit(1);
  });