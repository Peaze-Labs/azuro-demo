# Azuro betting

This repo showcases gasless betting on the [Azuro Protocol](https://azuro.org/) via Peaze. 

### What you'll need

1. Wallet with a bit of Polygon [USDT](https://polygonscan.com/token/0xc2132D05D31c914a87C6611C10748AEb04B58e8F) to bet with. 

### Setting up

```sh
git clone https://github.com/Peaze-Labs/azuro-demo.git
cd azuro-demo
npm i
cp .env.example .env
```

Then fill in your private key in `.env`. 
Your wallet will play the role of the user in the demo and be used to sign the transaction.

### Running the demo

**single bet**

1. Obtaining data. 

	Visit the [Azuro GraphQL interface](https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-polygon-v3). 
 
 	In the top section of the query editor, paste this:

	```
	query Games($where: Game_filter!) {
	  games(
	    first: 1
	    where: $where
	    orderBy: turnover
	    orderDirection: desc
	    subgraphError: allow
	  ) {
	    gameId
	    slug
	    status
	    startsAt
	    conditions {
	      conditionId
	      isExpressForbidden
	      status
	      outcomes {
	        currentOdds
	        outcomeId
	      }
	    }
	  }
	}
	```
	
 	In the bottom section of the query editor, under `query variables`, paste this:
 	
 	```
 	{
	  	"where": {
	      "hasActiveConditions": true,
	      "liquidityPool": "0x7043e4e1c4045424858ecbced80989feafc11b36"
		}
	}
 	```
 	
 	This will return the next upcoming game. The response should look something like this: 
 	
	```
	{
	  "data": {
	    "games": [
	      "swag"
	    ],
	    "conditions": [
	      {
	        "conditionId": "100100000000000015811616850000000000000263423119",
	        "isExpressForbidden": false,
	        "status": "Created",
	        "outcomes": [
	          {
	            "currentOdds": "1.835601489481",
	            "outcomeId": "2361"
	          },
	          {
	            "currentOdds": "1.765753218322",
	            "outcomeId": "2362"
	          }
	        ]
	      }
	    ]
	  }
	}
	```
	
	Grab the `conditionId`, `currentOdds`, and `outcomeId`. Paste these into their appropriate variable in the 	`singleBetEstimate` function in `singlebet.ts`.	

2. Use the following command to gaslessly place a bet on Azuro with the bet conditions defined. 
	
	```sh
	npx ts-node singlebet.ts
	```