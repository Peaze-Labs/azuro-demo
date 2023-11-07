import readline from 'readline';

/**
 * Prompts the user for input using the provided string and waits for their response.
 *
 * @param {string} prompt - The message displayed to the user, prompting them for input.
 * @returns {Promise<string>} A promise that resolves with the user's input as a string.
 *
 * @example
 *
 *   const name = await getUserInput("What's your name?");
 *   console.log(`Hello, ${name}!`);
 *
 */
export async function getUserInput(prompt: string): Promise<string> {
  // Create a readline interface to handle command-line input/output.
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Await user input based on the provided prompt.
  // The promise resolves once the user provides input and presses the Enter key.
  const userInput = await new Promise<string>(resolve => {
    rl.question(prompt, answer => {
      // Close the readline interface to free up resources.
      rl.close();

      // Resolve the promise with the user's input.
      resolve(answer);
    });
  });

  return userInput;
}

/**
 * Prompts the user for a yes/no response using the provided string and waits for their response.
 * Repeatedly prompts the user until a valid response is received. Valid responses are 'y', 'yes',
 * 'n', and 'no', case-insensitive.
 *
 * @param {string} prompt - The message displayed to the user.
 * @returns {Promise<boolean>} A promise that resolves to `true`/`false` for yes/no, respectively.
 *
 * @example
 *
 *   const wantsCoffee = await getUserInputYN("Would you like some coffee? (yes/no)");
 *   if (wantsCoffee) {
 *     console.log("Here's your coffee!");
 *   } else {
 *     console.log("Alright, no coffee for you.");
 *   }
 *
 */
export async function getUserInputYN(prompt: string): Promise<boolean> {
  let answer = '';
  while (!['y', 'n', 'yes', 'no'].includes(answer.toLowerCase())) {
    answer = await getUserInput(prompt);
  }
  return answer.toLowerCase()[0] === 'y';
}
