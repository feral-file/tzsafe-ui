import {
  LocalStorage,
  NetworkType,
  Regions,
  StorageKey,
} from "@ecadlabs/beacon-sdk";
import { ArrowRightIcon } from "@radix-ui/react-icons";
import { BeaconWallet } from "@taquito/beacon-wallet";
import { validateAddress, ValidationResult } from "@taquito/utils";
import type { AppProps } from "next/app";
import { usePathname } from "next/navigation";
import { useRouter } from "next/router";
import { useReducer, useEffect, useState } from "react";
import LoginModal from "../components/LoginModal";
import PoeModal from "../components/PoeModal";
import Sidebar from "../components/Sidebar";
import Spinner from "../components/Spinner";
import Footer from "../components/footer";
import NavBar from "../components/navbar";
import P2PClient from "../context/P2PClient";
import { AliasesProvider } from "../context/aliases";
import { WALLET_NETWORK } from "../context/config";
import {
  tezosState,
  action,
  reducer,
  emptyState,
  init,
  AppStateContext,
  AppDispatchContext,
  contractStorage,
} from "../context/state";
import "../styles/globals.css";
import { fetchContract } from "../utils/fetchContract";

// The default `papers.tech`-hosted matrix relay nodes have proven unreliable
// (CORS/network failures observed across multiple sessions and deployments),
// which can hang P2P/QR-pairing setup indefinitely. Restrict to the
// `octez.io` nodes (operated by Nomadic Labs), which have been consistently
// reachable, for both the wallet-side and dapp-side P2P transports.
const MATRIX_NODES = {
  [Regions.EUROPE_WEST]: [
    "beacon-node-1.octez.io",
    "beacon-node-2.octez.io",
    "beacon-node-3.octez.io",
    "beacon-node-4.octez.io",
    "beacon-node-5.octez.io",
    "beacon-node-6.octez.io",
    "beacon-node-7.octez.io",
    "beacon-node-8.octez.io",
  ],
};

export default function App({ Component, pageProps }: AppProps) {
  const [state, dispatch]: [tezosState, React.Dispatch<action>] = useReducer(
    reducer,
    emptyState()
  );

  const [isFetching, setIsFetching] = useState(true);
  const [hasSidebar, setHasSidebar] = useState(false);
  const [data, setData] = useState<undefined | string>();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!path) return;

    const queryParams = new URLSearchParams(window.location.search);

    const isPairing = queryParams.has("type") && queryParams.has("data");

    if (isPairing) {
      setData(queryParams.get("data")!);
    }

    const contracts = Object.keys(state.contracts);

    if ((path === "/" || path === "") && contracts.length > 0) {
      const contract = contracts[0];

      router.replace(`/${contract}/dashboard`);
      return;
    } else if (path === "/" || path === "") {
      // Get rid of query in case it comes from beacon
      router.replace("/");
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.currentContract,
    path,
    state.attemptedInitialLogin,
    state.contracts,
  ]);

  useEffect(() => {
    (async () => {
      if (
        router.pathname.includes("[walletAddress]") &&
        !router.query.walletAddress
      )
        return;

      if (
        !router.query.walletAddress ||
        Array.isArray(router.query.walletAddress) ||
        (router.query.walletAddress === state.currentContract &&
          !!state.currentStorage)
      ) {
        setIsFetching(false);
        return;
      }

      if (!!state.contracts[router.query.walletAddress]) {
        dispatch({
          type: "setCurrentContract",
          payload: router.query.walletAddress,
        });
        setIsFetching(false);
        return;
      }

      if (
        validateAddress(router.query.walletAddress) !== ValidationResult.VALID
      ) {
        setIsFetching(false);
        router.replace(
          `/invalid-contract?address=${router.query.walletAddress}`
        );
        return;
      }

      if (state.currentStorage?.address === router.query.walletAddress) {
        setIsFetching(false);
        return;
      }

      try {
        const storage = await fetchContract(
          state.connection,
          router.query.walletAddress
        );

        if (!storage) {
          setIsFetching(false);
          router.replace(
            `/invalid-contract?address=${router.query.walletAddress}`
          );
          return;
        }

        storage.address = router.query.walletAddress;

        dispatch({
          type: "setCurrentStorage",
          payload: storage as contractStorage & { address: string },
        });

        dispatch({
          type: "setCurrentContract",
          payload: router.query.walletAddress,
        });

        setIsFetching(false);
      } catch (e) {
        setIsFetching(false);

        router.replace(
          `/invalid-contract?address=${router.query.walletAddress}`
        );
      }
    })();
  }, [
    router.query.walletAddress,
    state.currentContract,
    dispatch,
    router,
    state.currentStorage,
    state.connection,
    state.contracts,
  ]);
  useEffect(() => {
    (async () => {
      if (state!.beaconWallet === null) {
        let a = init();
        dispatch({ type: "init", payload: a });

        const walletStorage = new LocalStorage("WALLET");
        const p2pStorage = new LocalStorage("P2P");

        // The SDK caches Matrix state in storage and, on the next load, trusts
        // that cache over the live server state:
        //  - MATRIX_SELECTED_NODE: the last-used relay node, reached *only*
        //    that cached node before ever consulting matrixNodes above, with
        //    no timeout and no fallback. If that node was decommissioned (a
        //    real, documented issue during the Beacon relay infrastructure
        //    migration - see https://github.com/ecadlabs/taquito/issues/3332),
        //    this hangs forever and permanently blocks wallet connection.
        //  - MATRIX_PEER_ROOM_IDS / MATRIX_PRESERVED_STATE: which pairing
        //    "room" and joined-room list to reuse for a given peer. The
        //    SDK's own source acknowledges this can't be trusted ("we cannot
        //    trust the current sync state" - P2PCommunicationClient
        //    getRelevantJoinedRoom) - if server-side membership has since
        //    diverged (e.g. after re-pairing), sends fail with M_FORBIDDEN
        //    "not in room", and the self-heal path re-checks the same stale
        //    cache, so it can get stuck making the same mistake repeatedly.
        // Clearing all three forces a fresh, safe rediscovery on every load.
        await Promise.all([
          walletStorage.delete(StorageKey.MATRIX_SELECTED_NODE).catch(() => {}),
          walletStorage.delete(StorageKey.MATRIX_PEER_ROOM_IDS).catch(() => {}),
          walletStorage
            .delete(StorageKey.MATRIX_PRESERVED_STATE)
            .catch(() => {}),
          p2pStorage.delete(StorageKey.MATRIX_SELECTED_NODE).catch(() => {}),
          p2pStorage.delete(StorageKey.MATRIX_PEER_ROOM_IDS).catch(() => {}),
          p2pStorage.delete(StorageKey.MATRIX_PRESERVED_STATE).catch(() => {}),
        ]);

        const wallet = new BeaconWallet({
          name: "TzSafe",
          network: WALLET_NETWORK,
          storage: walletStorage,
          matrixNodes: MATRIX_NODES,
        });

        dispatch!({ type: "beaconConnect", payload: wallet });

        // The P2P/matrix transport relies on third-party relay servers that
        // can be slow, flaky, or unreachable from some origins. Initialize it
        // in the background (with a timeout) so a relay outage only disables
        // P2P/QR pairing instead of blocking wallet connection entirely -
        // extension wallets like Temple don't need this transport at all.
        (async () => {
          try {
            const p2pClient = new P2PClient({
              name: "TzSafe",
              storage: p2pStorage,
              matrixNodes: MATRIX_NODES,
            });

            await p2pClient.init();
            await Promise.race([
              p2pClient.connect(p2pClient.handleMessages),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error("P2P client connect timed out")),
                  15000
                )
              ),
            ]);

            // Connect stored peers
            Object.entries(a.connectedDapps).forEach(([address, dapps]) => {
              Object.values(dapps).forEach(data => {
                p2pClient
                  .addPeer(data)
                  .catch(_ => console.log("Failed to connect to peer", data));
              });
            });

            dispatch!({ type: "p2pConnect", payload: p2pClient });
          } catch (e) {
            console.error("Failed to initialize P2P client", e);
          }
        })();

        if (state.attemptedInitialLogin) return;

        const activeAccount = await wallet.client.getActiveAccount();
        if (activeAccount && state?.accountInfo == null) {
          const userAddress = await wallet.getPKH();
          const balance = await state?.connection.tz.getBalance(userAddress);
          dispatch({
            type: "login",
            // TODO: FIX
            //@ts-ignore
            accountInfo: activeAccount!,
            address: userAddress,
            balance: balance!.toString(),
          });
        } else {
          dispatch({
            type: "setAttemptedInitialLogin",
            payload: true,
          });
        }
      }
    })();
  }, [state.beaconWallet]);

  useEffect(() => {
    setHasSidebar(false);
  }, [path]);

  const isSidebarHidden =
    Object.values(state.contracts).length === 0 &&
    (path === "/" ||
      path === "/new-wallet" ||
      path === "/import-wallet" ||
      path === "/address-book");

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        <AliasesProvider aliasesFromState={state.aliases}>
          <div className="relative min-h-screen">
            <div id="modal" />
            {!!data && (
              <LoginModal
                data={data}
                onEnd={() => {
                  setData(undefined);
                }}
              />
            )}
            <PoeModal />
            <NavBar />

            {isSidebarHidden ? null : (
              <Sidebar
                isOpen={hasSidebar}
                onClose={() => setHasSidebar(false)}
                isLoading={isFetching}
              />
            )}

            <div className={`pb-28 pt-20 ${isSidebarHidden ? "" : "md:pl-72"}`}>
              <button
                className="ml-4 mt-4 flex items-center space-x-2 text-zinc-300 md:hidden"
                onClick={() => {
                  setHasSidebar(true);
                }}
              >
                <span className="text-xs">Open sidebar</span>
                <ArrowRightIcon className="h-4 w-4" />
              </button>

              {isFetching || !state.attemptedInitialLogin ? (
                <div className="mt-12 flex w-full items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                <Component {...pageProps} />
              )}
            </div>
            <Footer shouldRemovePadding={isSidebarHidden} />
          </div>
        </AliasesProvider>
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}
