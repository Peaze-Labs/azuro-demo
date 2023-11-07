import axios from 'axios';
import { getUserInputYN } from './utils/input';
import { ethers } from 'ethers'
import { config } from 'dotenv';
import LP_ABI from './abis/lp-abi.json';
import PROXY_ABI from './abis/proxy-abi.json';
import USDT_ABI from './abis/usdt-abi.json';
config();

const SRC_CHAIN_ID = 137; // Polygon
const DST_CHAIN_ID = 137; // Polygon
const USDT_TO_BET = process.env.USDT_TO_BET!;
const USDT_ADDRESS = '0x7FFB3d637014488b63fb9858E279385685AFc1e2' // USDT Proxy contract on Polygon
const LP_ADDRESS = '0xf5c1B93171D1D812d125233df15F36FEe8f4BA45' // Azuro LP Proxy contract on Polygon
const EXPRESS_ADDRESS = '0x92a4e8Bc6B92a2e1ced411f41013B5FE6BE07613' // Azuro BetExpress contract on Polygon
const PROXY_ADDRESS = '0x200BD65A3189930634af857C72281abE63C3da5e' // Azuro ProxyFront contract on Polygon
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY!);

// Contract Interfaces
const lpInterface = new ethers.Interface(LP_ABI);
const proxyInterface = new ethers.Interface(PROXY_ABI);
const usdtInterface = new ethers.Interface(USDT_ABI);

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

  // Azuro Game Market Variables from the subgraph
  const conditionId1: any = "100100000000000015811616850000000000000263423119";
  const outcomeId1: any = "2361";
  // const currentOdds1: any = "1.835601489481";
  const conditionId2: any = "100100000000000015811616850000000000000263423119";
  const outcomeId2: any = "2361";
  // const currentOdds2: any = "1.835601489481";
  const selections: {}[] = [
    [conditionId1, outcomeId1],
    [conditionId2, outcomeId2]
  ];
  
  // Bet variables
  const betAmount = ethers.parseUnits(USDT_TO_BET, 6);
  const deadline = Math.floor(Date.now() / 1000) + 2000;
  const affiliate = "0x3121e8d2a4f0F220e8C7C7c6D9a7046527A54B19"; // BookieBot Revenue Share Wallet
//   const minOdds = calculateMinOdds(currentOdds);

  const encodedBetData = ethers.AbiCoder.defaultAbiCoder().encode(
    [ 'tuple(uint256, uint64)[]' ], 
    [ selections ]
  );

  const encodedBet = proxyInterface.encodeFunctionData('bet', [
    LP_ADDRESS,
    [
      {
        core: EXPRESS_ADDRESS, 
        amount: betAmount,
        expiresAt: deadline,
        extraData: {
          affiliate: affiliate, 
          minOdds: 0, 
          data: encodedBetData
        }
      }
    ]
  ])

  const betTx = {
    to: PROXY_ADDRESS,
    data: encodedBet
  }

  const approvalTx = {
    to: USDT_ADDRESS,
    data: usdtInterface.encodeFunctionData('approve', [
      PROXY_ADDRESS,
      betAmount
    ])
  };

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
    //   metaTxSignature: await wallet.signTypedData(
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