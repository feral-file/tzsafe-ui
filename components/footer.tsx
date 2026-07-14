import { NetworkType } from "@ecadlabs/beacon-sdk";
import {
  FERAL_FILE_CONTACT_URL,
  FERAL_FILE_URL,
  MAINNET_UI_URL,
  PREFERED_NETWORK,
  SHADOWNET_UI_URL,
  TZKT_EXPLORER_URL,
  TZSAFE_DOCS_URL,
} from "../context/config";

const Footer = ({
  shouldRemovePadding,
}: React.PropsWithChildren<{ shouldRemovePadding: boolean }>) => {
  const altUiUrl =
    PREFERED_NETWORK === NetworkType.MAINNET
      ? SHADOWNET_UI_URL
      : MAINNET_UI_URL;
  const altUiLabel =
    PREFERED_NETWORK === NetworkType.MAINNET
      ? "TzSafe Shadownet"
      : "TzSafe Mainnet";

  return (
    <footer
      className={`absolute bottom-0 left-0 right-0 h-28 border-t-4 border-zinc-500 bg-dark text-center ${
        shouldRemovePadding ? "" : "md:left-72"
      } lg:text-left`}
    >
      <div className="flex flex-col items-center justify-center space-y-2 p-4 text-center text-white">
        <div className="flex flex-col items-center space-y-2 md:block md:space-x-6 md:space-y-0">
          <a
            href={FERAL_FILE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-zinc-400"
          >
            ©{new Date().getFullYear()} Copyright Feral File
          </a>

          <a href={FERAL_FILE_CONTACT_URL} target="_blank" rel="noreferrer">
            Contact
          </a>
          <a href={TZSAFE_DOCS_URL} target="_blank" rel="noreferrer">
            Documentation
          </a>
          {altUiUrl ? (
            <a href={altUiUrl} target="_blank" rel="noreferrer">
              {altUiLabel}
            </a>
          ) : null}
        </div>
        <a href={TZKT_EXPLORER_URL} target="_blank" rel="noreferrer">
          Powered by TzKT API
        </a>
      </div>
    </footer>
  );
};
export default Footer;
