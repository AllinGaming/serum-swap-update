"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Swap = void 0;
const bn_js_1 = __importDefault(require("bn.js"));
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@project-serum/anchor");
const web3_js_2 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const base64 = __importStar(require("base64-js"));
const serum_1 = require("@project-serum/serum");
const idl_1 = require("./idl");
const utils_1 = require("./utils");
const swap_markets_1 = __importDefault(require("./swap-markets"));
/**
 *
 * # Swap
 *
 * A module to swap tokens across USD(x) quoted markets on the Serum DEX,
 * providing a thin wrapper around an
 * [Anchor](https://github.com/project-serum/anchor) generated client in an
 * attempt to abstract away orderbook details.
 *
 * ## Usage
 *
 * ### Create a client
 *
 * ```javascript
 * const client = new Swap(provider, tokenList)
 * ```
 *
 * ### List all token mints to swap
 *
 * ```javascript
 * const tokens = client.tokens();
 * ```
 *
 * ### Get all candidate swap pairs for a given token mint
 *
 * ```javascript
 * const swappableTokens = client.pairs(usdcPublicKey);
 * ```
 *
 * ### Swap one token for another.
 *
 * ```javascript
 * await client.swap({
 *   fromMint,
 *   toMint,
 *   amount,
 * })
 * ```
 *
 * ## Swap Program Basics
 *
 * One should have a basic understanding of the on-chain
 * [Swap](https://github.com/project-serum/swap) program before using the
 * client. Two core APIs are exposed.
 *
 * * [swap](https://github.com/project-serum/swap/blob/master/programs/swap/src/lib.rs#L36) -
 *   swaps two tokens on a single A/B market. This is just an IOC trade at the
 *   BBO that instantly settles.
 * * [swapTransitive](https://github.com/project-serum/swap/blob/master/programs/swap/src/lib.rs#L107) -
 *   swaps two tokens across **two** A/x, B/x markets in the same manner as
 *   `swap`.
 *
 * When swapping to/from a USD(x) token, the swap client will use the `swap` API.
 * When swapping to/from a non-USD(x) token, e.g., wBTC for wETH, the swap
 * client will use the `swapTransitive`API with USD(x) quoted markets to bridge
 * the two tokens.
 *
 * For both APIs, if the number of tokens received from the trade is less than
 * the client provided `minExpectedAmount`, the transaction aborts.
 *
 * Note that if this client package is insufficient, one can always use the
 *  Anchor generated client directly, exposing an API mapping one-to-one to
 * these program instructions. See the
 * [`tests/`](https://github.com/project-serum/swap/blob/master/tests/swap.js)
 * for examples of using the Anchor generated swap client.
 *
 * ## Serum Orderbook Program Basics
 *
 * Additionally, because the Swap program is an on-chain frontend for the Serum
 * DEX, one should also be aware of the basic accounts needed for trading on
 * the Serum DEX.
 *
 * Namely, a wallet must have an "open orders" account for each market the
 * wallet trades on. The "open orders" account is akin to how a wallet
 *  must have an SPL token account to own tokens, except instead of holding
 * tokens, the wallet can make trades on the orderbook.
 *
 * ### Creating Open Orders Accounts
 *
 * When the wallet doesn't have an open orders account already created,
 * the swap client provides two choices.
 *
 * 1. Explicitly open (and close) the open
 *    orders account explicitly via the [[initAccounts]]
 *    (and [[closeAccounts]]) methods.
 * 2. Automatically create the required accounts by preloading the instructions
 *    in the [[swap]] transaction.
 *
 * Note that if the user is swapping between two non-USD(x) tokens, e.g., wBTC
 * for wETH, then the user needs *two* open orders accounts on both wBTC/USD(x)
 * and wETH/USD(x) markets. So if one chooses option two **and** needs to
 * create open orders accounts for both markets, then the transaction
 * is broken up into two (and `Provider.sendAll` is used) to prevent hitting
 * transaction size limits.
 */
class Swap {
    /**
     * @param provider  The wallet and network context to use for the client.
     * @param tokenList The token list providing market addresses for each mint.
     */
    constructor(provider, tokenList) {
        this.program = new anchor_1.Program(idl_1.IDL, utils_1.SWAP_PID, provider);
        this.swapMarkets = new swap_markets_1.default(provider, tokenList);
    }
    /**
     * Returns a list of all the available tokens that can be swapped. This
     * includes all tokens with USDC or USDT quoted markets.
     *
     * To update the set of swappable tokens, please update the
     * [`@solana/spl-token-registry`](https://github.com/solana-labs/token-list)
     * package to list the USD(x) markets available for each token mint.
     */
    tokens() {
        return this.swapMarkets.tokens();
    }
    /**
     * Given a token, returns the list of all candidate tokens that can be
     * swapped with the given token. This is important, because, in order for a
     * swap to be available, there must exist a path across a USD(x) quoted
     * market.
     *
     * To swap across alternative quote currencies, one should use the Anchor
     * generated client directly (although it's recommended to trade
     * across USD(x)) since they tend to be the most liquid.
     */
    pairs(mint) {
        return this.swapMarkets.pairs(mint);
    }
    /**
     * Sends a transaction to initialize all accounts required for a swap between
     * the two mints. I.e., creates the DEX open orders accounts.
     *
     * @throws if all open orders accounts already exist.
     */
    async initAccounts(params) {
        const { fromMint, toMint } = params;
        const signers = [];
        const tx = new web3_js_1.Transaction();
        // Direct swap on USD(x).
        if (fromMint.equals(utils_1.USDC_PUBKEY) || fromMint.equals(utils_1.USDT_PUBKEY)) {
            const openOrders = new web3_js_2.Account();
            const marketAddress = await this.swapMarkets.getMarketAddressIfNeeded(fromMint, toMint);
            tx.add(await serum_1.OpenOrders.makeCreateAccountTransaction(this.program.provider.connection, marketAddress, this.program.provider.wallet.publicKey, openOrders.publicKey, utils_1.DEX_PID));
            signers.push(openOrders);
            tx.add(this.program.instruction.initAccount({
                accounts: {
                    openOrders: openOrders.publicKey,
                    authority: this.program.provider.wallet.publicKey,
                    market: marketAddress,
                    dexProgram: utils_1.DEX_PID,
                    rent: web3_js_1.SYSVAR_RENT_PUBKEY,
                },
            }));
        }
        // Direct swap on USD(x).
        else if (toMint.equals(utils_1.USDC_PUBKEY) || toMint.equals(utils_1.USDT_PUBKEY)) {
            const openOrders = new web3_js_2.Account();
            const marketAddress = await this.swapMarkets.getMarketAddressIfNeeded(toMint, fromMint);
            tx.add(await serum_1.OpenOrders.makeCreateAccountTransaction(this.program.provider.connection, marketAddress, this.program.provider.wallet.publicKey, openOrders.publicKey, utils_1.DEX_PID));
            tx.add(this.program.instruction.initAccount({
                accounts: {
                    openOrders: openOrders.publicKey,
                    authority: this.program.provider.wallet.publicKey,
                    market: marketAddress,
                    dexProgram: utils_1.DEX_PID,
                    rent: web3_js_1.SYSVAR_RENT_PUBKEY,
                },
            }));
            signers.push(openOrders);
        }
        // Transitive swap across USD(x).
        else {
            // Builds the instructions for initializing open orders for a transitive
            // swap.
            const tryBuildTransitive = async (usdx) => {
                // Instructions and signers to build.
                const ixs = [];
                const sigs = [];
                // Markets.
                const marketFrom = await this.swapMarkets.getMarketAddress(usdx, fromMint);
                const marketTo = await this.swapMarkets.getMarketAddress(usdx, toMint);
                // Open orders accounts (already existing).
                const ooAccsFrom = await serum_1.OpenOrders.findForMarketAndOwner(this.program.provider.connection, marketFrom, this.program.provider.wallet.publicKey, utils_1.DEX_PID);
                const ooAccsTo = await serum_1.OpenOrders.findForMarketAndOwner(this.program.provider.connection, marketTo, this.program.provider.wallet.publicKey, utils_1.DEX_PID);
                if (ooAccsFrom[0] && ooAccsTo[0]) {
                    throw new Error('Open orders already exist');
                }
                // No open orders account for the from market, so make it.
                if (!ooAccsFrom[0]) {
                    const ooFrom = new web3_js_2.Account();
                    ixs.push(await serum_1.OpenOrders.makeCreateAccountTransaction(this.program.provider.connection, marketFrom, this.program.provider.wallet.publicKey, ooFrom.publicKey, utils_1.DEX_PID));
                    ixs.push(this.program.instruction.initAccount({
                        accounts: {
                            openOrders: ooFrom.publicKey,
                            authority: this.program.provider.wallet.publicKey,
                            market: marketFrom,
                            dexProgram: utils_1.DEX_PID,
                            rent: web3_js_1.SYSVAR_RENT_PUBKEY,
                        },
                    }));
                    sigs.push(ooFrom);
                }
                // No open orders account for the to market, so make it.
                if (!ooAccsTo[0]) {
                    const ooTo = new web3_js_2.Account();
                    ixs.push(await serum_1.OpenOrders.makeCreateAccountTransaction(this.program.provider.connection, marketTo, this.program.provider.wallet.publicKey, ooTo.publicKey, utils_1.DEX_PID));
                    ixs.push(this.program.instruction.initAccount({
                        accounts: {
                            openOrders: ooTo.publicKey,
                            authority: this.program.provider.wallet.publicKey,
                            market: marketTo,
                            dexProgram: utils_1.DEX_PID,
                            rent: web3_js_1.SYSVAR_RENT_PUBKEY,
                        },
                    }));
                    sigs.push(ooTo);
                }
                // Done.
                return [ixs, sigs];
            };
            try {
                // Try USDC.
                const [ixs, sigs] = await tryBuildTransitive(utils_1.USDC_PUBKEY);
                tx.add(...ixs);
                signers.push(...sigs);
            }
            catch (err) {
                // USDC path doesn't exist. Try USDT.
                const [ixs, sigs] = await tryBuildTransitive(utils_1.USDT_PUBKEY);
                tx.add(...ixs);
                signers.push(...sigs);
            }
        }
        // Send the constructed transaction to the cluster.
        return await this.program.provider.send(tx, signers);
    }
    /**
     * Sends a transaction to close all accounts required for a swap transaction,
     * i.e., all currently open DEX open orders accounts for the given `fromMint`
     * `toMint` swap path.
     *
     * @throws if no open orders accounts exist.
     */
    async closeAccounts(params) {
        const { fromMint, toMint } = params;
        const tx = new web3_js_1.Transaction();
        if (fromMint.equals(utils_1.USDC_PUBKEY) || fromMint.equals(utils_1.USDT_PUBKEY)) {
            const marketAddress = await this.swapMarkets.getMarketAddress(fromMint, toMint);
            const ooAccounts = await serum_1.OpenOrders.findForMarketAndOwner(this.program.provider.connection, marketAddress, this.program.provider.wallet.publicKey, utils_1.DEX_PID);
            if (!ooAccounts[0]) {
                throw new Error(`Open orders account doesn't exist`);
            }
            tx.add(this.program.instruction.closeAccount({
                accounts: {
                    openOrders: ooAccounts[0].publicKey,
                    authority: this.program.provider.wallet.publicKey,
                    destination: this.program.provider.wallet.publicKey,
                    market: marketAddress,
                    dexProgram: utils_1.DEX_PID,
                },
            }));
        }
        else if (toMint.equals(utils_1.USDC_PUBKEY) || toMint.equals(utils_1.USDT_PUBKEY)) {
            const marketAddress = await this.swapMarkets.getMarketAddress(toMint, fromMint);
            const ooAccounts = await serum_1.OpenOrders.findForMarketAndOwner(this.program.provider.connection, marketAddress, this.program.provider.wallet.publicKey, utils_1.DEX_PID);
            if (!ooAccounts[0]) {
                throw new Error(`Open orders account doesn't exist`);
            }
            tx.add(this.program.instruction.closeAccount({
                accounts: {
                    openOrders: ooAccounts[0].publicKey,
                    authority: this.program.provider.wallet.publicKey,
                    destination: this.program.provider.wallet.publicKey,
                    market: marketAddress,
                    dexProgram: utils_1.DEX_PID,
                },
            }));
        }
        else {
            const tryBuildTransitive = async (usdx) => {
                // Instructions and signers to build.
                const ixs = [];
                const sigs = [];
                // Markets.
                const marketFrom = await this.swapMarkets.getMarketAddress(usdx, fromMint);
                const marketTo = await this.swapMarkets.getMarketAddress(usdx, toMint);
                // Open orders accounts (already existing).
                const ooAccsFrom = await serum_1.OpenOrders.findForMarketAndOwner(this.program.provider.connection, marketFrom, this.program.provider.wallet.publicKey, utils_1.DEX_PID);
                const ooAccsTo = await serum_1.OpenOrders.findForMarketAndOwner(this.program.provider.connection, marketTo, this.program.provider.wallet.publicKey, utils_1.DEX_PID);
                if (!ooAccsFrom[0] && !ooAccsTo[0]) {
                    throw new Error(`No open orders accounts left to close`);
                }
                // Close the from market open orders account, if it exists.
                if (ooAccsFrom[0]) {
                    ixs.push(this.program.instruction.closeAccount({
                        accounts: {
                            openOrders: ooAccsFrom[0].publicKey,
                            authority: this.program.provider.wallet.publicKey,
                            destination: this.program.provider.wallet.publicKey,
                            market: marketFrom,
                            dexProgram: utils_1.DEX_PID,
                        },
                    }));
                }
                // Close the to market open orders account, if it exists.
                if (ooAccsTo[0]) {
                    ixs.push(this.program.instruction.closeAccount({
                        accounts: {
                            openOrders: ooAccsTo[0].publicKey,
                            authority: this.program.provider.wallet.publicKey,
                            destination: this.program.provider.wallet.publicKey,
                            market: marketTo,
                            dexProgram: utils_1.DEX_PID,
                        },
                    }));
                }
                return ixs;
            };
            try {
                // Try USDC.
                const ixs = await tryBuildTransitive(utils_1.USDC_PUBKEY);
                tx.add(...ixs);
            }
            catch (err) {
                // USDC path doesn't exist. Try USDT.
                const ixs = await tryBuildTransitive(utils_1.USDT_PUBKEY);
                tx.add(...ixs);
            }
        }
        // Send the constructed transaction to the cluster.
        return await this.program.provider.send(tx);
    }
    /**
     * Executes a swap against the Serum DEX on Solana. When using one should
     * first use `estimate` along with a user defined error tolerance to calculate
     * the `minExpectedSwapAmount`, which provides a lower bound for the number
     * of output tokens received when executing the swap. If, for example,
     * swapping on an illiquid market and the output tokens is less than
     * `minExpectedSwapAmount`, then the transaction will fail in an attempt to
     * prevent an undesireable outcome.
     */
    async swap(params) {
        const [ixs, signers] = await this.swapIxs(params);
        const tx = new web3_js_1.Transaction();
        tx.add(...ixs);
        return this.program.provider.send(tx, signers, params.options);
    }
    /**
     * Returns an estimate for the number of *to*, i.e., output, tokens one would
     * get for the given swap parameters. This is useful to inform the user
     * approximately what will happen if the user executes the swap trade. UIs
     * should use this in conjunction with some bound (e.g. 5%), to prevent users
     * from making unexpected trades.
     */
    async estimate(params) {
        // Build the transaction.
        const [ixs, signers] = await this.swapIxs({
            ...params,
            minExpectedSwapAmount: new bn_js_1.default(1),
        });
        const tx = new web3_js_1.Transaction();
        tx.add(...ixs);
        // Simulate it.
        const resp = await this.program.provider.simulate(tx, signers, params.options);
        if (resp === undefined || resp.value.err || !resp.value.logs) {
            throw new Error('Unable to simulate swap');
        }
        // Decode the return value.
        //
        // TODO: Expose the event parsing api in anchor to make this less manual.
        let didSwapEvent = resp.value.logs
            .filter((log) => log.startsWith('Program log: 4ZfIrPLY4R'))
            .map((log) => {
            const logStr = log.slice('Program log: '.length);
            const logArr = Buffer.from(base64.toByteArray(logStr));
            return this.program.coder.events.decode('DidSwap', logArr.slice(8));
        })[0];
        return didSwapEvent.toAmount;
    }
    async swapIxs(params) {
        let { fromMint, toMint, quoteWallet, fromWallet, toWallet, amount, minExpectedSwapAmount, referral, } = params;
        // Defaults to .5% error off the estimate, if not provided.
        if (minExpectedSwapAmount === undefined) {
            const estimated = await this.estimate(params);
            minExpectedSwapAmount = estimated.mul(new bn_js_1.default(99.5)).div(new bn_js_1.default(100));
        }
        // If either wallet isn't given, then use the associated token account.
        // Assumes the accounts are already created.
        if (!fromWallet) {
            fromWallet = await (0, utils_1.getAssociatedTokenAddress)(spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID, spl_token_1.TOKEN_PROGRAM_ID, fromMint, this.program.provider.wallet.publicKey);
        }
        if (!toWallet) {
            toWallet = await (0, utils_1.getAssociatedTokenAddress)(spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID, spl_token_1.TOKEN_PROGRAM_ID, toMint, this.program.provider.wallet.publicKey);
        }
        // If swapping to/from a USD(x) token, then swap directly on the market.
        if (fromMint.equals(utils_1.USDC_PUBKEY) || fromMint.equals(utils_1.USDT_PUBKEY)) {
            return await this.swapDirectIxs({
                coinWallet: toWallet,
                pcWallet: fromWallet,
                baseMint: toMint,
                quoteMint: fromMint,
                side: Side.Bid,
                amount,
                minExpectedSwapAmount,
                referral,
            });
        }
        else if (toMint.equals(utils_1.USDC_PUBKEY) || toMint.equals(utils_1.USDT_PUBKEY)) {
            return await this.swapDirectIxs({
                coinWallet: fromWallet,
                pcWallet: toWallet,
                baseMint: fromMint,
                quoteMint: toMint,
                side: Side.Ask,
                amount,
                minExpectedSwapAmount,
                referral,
            });
        }
        // Neither wallet is a USD stable coin. So perform a transitive swap.
        if (!quoteWallet) {
            if (this.swapMarkets.usdcPathExists(fromMint, toMint)) {
                quoteWallet = await (0, utils_1.getAssociatedTokenAddress)(spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID, spl_token_1.TOKEN_PROGRAM_ID, utils_1.USDC_PUBKEY, this.program.provider.wallet.publicKey);
            }
            else {
                quoteWallet = await (0, utils_1.getAssociatedTokenAddress)(spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID, spl_token_1.TOKEN_PROGRAM_ID, utils_1.USDT_PUBKEY, this.program.provider.wallet.publicKey);
            }
        }
        return await this.swapTransitiveIxs({
            fromMint,
            toMint,
            fromWallet,
            toWallet,
            pcWallet: quoteWallet,
            amount,
            minExpectedSwapAmount,
            referral,
        });
    }
    async swapDirectIxs({ coinWallet, pcWallet, baseMint, quoteMint, side, amount, minExpectedSwapAmount, referral, }) {
        const marketClient = await serum_1.Market.load(this.program.provider.connection, this.swapMarkets.getMarketAddress(quoteMint, baseMint), this.program.provider.opts, utils_1.DEX_PID);
        const [vaultSigner] = await (0, utils_1.getVaultOwnerAndNonce)(marketClient.address);
        let openOrders = await (async () => {
            let openOrders = await serum_1.OpenOrders.findForMarketAndOwner(this.program.provider.connection, marketClient.address, this.program.provider.wallet.publicKey, utils_1.DEX_PID);
            // If we have an open orders account use it. It doesn't matter which
            // one we use.
            return openOrders[0] ? openOrders[0].address : undefined;
        })();
        const needsOpenOrders = openOrders === undefined;
        const ixs = [];
        const signers = [];
        // Create the open orders account, if needed.
        if (needsOpenOrders) {
            const oo = new web3_js_2.Account();
            signers.push(oo);
            openOrders = oo.publicKey;
            ixs.push(await serum_1.OpenOrders.makeCreateAccountTransaction(this.program.provider.connection, marketClient.address, this.program.provider.wallet.publicKey, oo.publicKey, utils_1.DEX_PID));
        }
        ixs.push(this.program.instruction.swap(side, amount, minExpectedSwapAmount, {
            accounts: {
                market: {
                    market: marketClient.address,
                    // @ts-ignore
                    requestQueue: marketClient._decoded.requestQueue,
                    // @ts-ignore
                    eventQueue: marketClient._decoded.eventQueue,
                    bids: marketClient.bidsAddress,
                    asks: marketClient.asksAddress,
                    // @ts-ignore
                    coinVault: marketClient._decoded.baseVault,
                    // @ts-ignore
                    pcVault: marketClient._decoded.quoteVault,
                    vaultSigner,
                    openOrders,
                    orderPayerTokenAccount: side.bid ? pcWallet : coinWallet,
                    coinWallet: coinWallet,
                },
                pcWallet,
                authority: this.program.provider.wallet.publicKey,
                dexProgram: utils_1.DEX_PID,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                rent: web3_js_1.SYSVAR_RENT_PUBKEY,
            },
            remainingAccounts: referral && [referral],
        }));
        // TOOD: enable once the DEX supports closing open orders accounts.
        const _enabled = false;
        // If an account was opened for this swap, then close it in the same
        // transaction.
        if (_enabled && needsOpenOrders) {
            ixs.push(this.program.instruction.closeAccount({
                accounts: {
                    openOrders,
                    authority: this.program.provider.wallet.publicKey,
                    destination: this.program.provider.wallet.publicKey,
                    market: marketClient.address,
                    dexProgram: utils_1.DEX_PID,
                },
            }));
        }
        return [ixs, signers];
    }
    async swapTransitiveIxs({ fromMint, toMint, fromWallet, toWallet, pcWallet, amount, minExpectedSwapAmount, referral, }) {
        let fromMarket, toMarket;
        try {
            // Try USDC path.
            fromMarket = this.swapMarkets.getMarketAddress(utils_1.USDC_PUBKEY, fromMint);
            toMarket = this.swapMarkets.getMarketAddress(utils_1.USDC_PUBKEY, toMint);
        }
        catch (err) {
            // USDC path doesn't exist. Try USDT.
            fromMarket = this.swapMarkets.getMarketAddress(utils_1.USDT_PUBKEY, fromMint);
            toMarket = this.swapMarkets.getMarketAddress(utils_1.USDT_PUBKEY, toMint);
        }
        const [fromMarketClient, toMarketClient] = await Promise.all([
            serum_1.Market.load(this.program.provider.connection, fromMarket, this.program.provider.opts, utils_1.DEX_PID),
            serum_1.Market.load(this.program.provider.connection, toMarket, this.program.provider.opts, utils_1.DEX_PID),
        ]);
        const [fromVaultSigner] = await (0, utils_1.getVaultOwnerAndNonce)(fromMarketClient.address);
        const [toVaultSigner] = await (0, utils_1.getVaultOwnerAndNonce)(toMarketClient.address);
        const [fromOpenOrders, toOpenOrders] = await (async () => {
            let [fromOpenOrders, toOpenOrders] = await Promise.all([
                serum_1.OpenOrders.findForMarketAndOwner(this.program.provider.connection, fromMarketClient.address, this.program.provider.wallet.publicKey, utils_1.DEX_PID),
                serum_1.OpenOrders.findForMarketAndOwner(this.program.provider.connection, toMarketClient.address, this.program.provider.wallet.publicKey, utils_1.DEX_PID),
            ]);
            // If we have an open orders account use it. It doesn't matter which
            // one we use.
            return [
                fromOpenOrders[0] ? fromOpenOrders[0].address : undefined,
                toOpenOrders[0] ? toOpenOrders[0].address : undefined,
            ];
        })();
        const fromNeedsOpenOrders = fromOpenOrders === undefined;
        const toNeedsOpenOrders = toOpenOrders === undefined;
        const ixs = [];
        const signers = [];
        // Add instruction to batch create all open orders accounts, if needed.
        let accounts = [];
        if (fromNeedsOpenOrders || true) {
            const oo = new web3_js_2.Account();
            signers.push(oo);
            accounts.push(oo);
        }
        if (toNeedsOpenOrders || true) {
            const oo = new web3_js_2.Account();
            signers.push(oo);
            accounts.push(oo);
        }
        if (fromNeedsOpenOrders || toNeedsOpenOrders || true) {
            let remainingAccounts = accounts.map((a) => {
                return {
                    pubkey: a.publicKey,
                    isSigner: true,
                    isWritable: true,
                };
            });
            const openOrdersSize = 200;
            const lamports = new bn_js_1.default(await this.program.provider.connection.getMinimumBalanceForRentExemption(openOrdersSize));
            // ixs.push(
            // 	this.createAccountsProgram.instruction.createAccounts({
            // 		accounts: {
            // 			funding: this.program.provider.wallet.publicKey,
            // 			owner: DEX_PID,
            // 			systemProgram: SystemProgram.programId,
            // 		},
            // 		remainingAccounts,
            // 	}),
            // );
        }
        ixs.push(this.program.instruction.swapTransitive(amount, minExpectedSwapAmount, {
            accounts: {
                from: {
                    market: fromMarketClient.address,
                    // @ts-ignore
                    requestQueue: fromMarketClient._decoded.requestQueue,
                    // @ts-ignore
                    eventQueue: fromMarketClient._decoded.eventQueue,
                    bids: fromMarketClient.bidsAddress,
                    asks: fromMarketClient.asksAddress,
                    // @ts-ignore
                    coinVault: fromMarketClient._decoded.baseVault,
                    // @ts-ignore
                    pcVault: fromMarketClient._decoded.quoteVault,
                    vaultSigner: fromVaultSigner,
                    openOrders: fromOpenOrders,
                    orderPayerTokenAccount: fromWallet,
                    coinWallet: fromWallet,
                },
                to: {
                    market: toMarketClient.address,
                    // @ts-ignore
                    requestQueue: toMarketClient._decoded.requestQueue,
                    // @ts-ignore
                    eventQueue: toMarketClient._decoded.eventQueue,
                    bids: toMarketClient.bidsAddress,
                    asks: toMarketClient.asksAddress,
                    // @ts-ignore
                    coinVault: toMarketClient._decoded.baseVault,
                    // @ts-ignore
                    pcVault: toMarketClient._decoded.quoteVault,
                    vaultSigner: toVaultSigner,
                    openOrders: toOpenOrders,
                    orderPayerTokenAccount: pcWallet,
                    coinWallet: toWallet,
                },
                pcWallet,
                authority: this.program.provider.wallet.publicKey,
                dexProgram: utils_1.DEX_PID,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                rent: web3_js_1.SYSVAR_RENT_PUBKEY,
            },
            remainingAccounts: referral && [referral],
        }));
        return [ixs, signers];
    }
}
exports.Swap = Swap;
const Side = {
    Bid: { bid: {} },
    Ask: { ask: {} },
};
//# sourceMappingURL=index.js.map