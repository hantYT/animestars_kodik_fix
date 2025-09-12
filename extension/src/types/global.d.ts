// Глобальные типы для расширения

declare global {
  namespace chrome {
    namespace runtime {
      interface Port {
        name: string;
        disconnect(): void;
        onDisconnect: {
          addListener(callback: () => void): void;
        };
        onMessage: {
          addListener(callback: (message: any) => void): void;
        };
        postMessage(message: any): void;
      }

      interface MessageSender {
        tab?: chrome.tabs.Tab;
        frameId?: number;
        id?: string;
        url?: string;
        tlsChannelId?: string;
      }

      interface InstalledDetails {
        reason: 'install' | 'update' | 'chrome_update' | 'shared_module_update';
        previousVersion?: string;
        id?: string;
      }

      interface Manifest {
        name: string;
        version: string;
        description?: string;
        [key: string]: any;
      }

      function sendMessage(message: any, responseCallback?: (response: any) => void): void;
      function sendMessage(extensionId: string, message: any, responseCallback?: (response: any) => void): void;
      function getManifest(): Manifest;

      var onMessage: {
        addListener(callback: (message: any, sender: MessageSender, sendResponse: (response?: any) => void) => void): void;
        removeListener(callback: (message: any, sender: MessageSender, sendResponse: (response?: any) => void) => void): void;
      };

      var onInstalled: {
        addListener(callback: (details: InstalledDetails) => void): void;
      };

      var id: string;
    }

    namespace tabs {
      interface Tab {
        id?: number;
        index: number;
        windowId: number;
        highlighted: boolean;
        active: boolean;
        pinned: boolean;
        url?: string;
        title?: string;
        favIconUrl?: string;
      }

      function query(queryInfo: object, callback: (result: Tab[]) => void): void;
      function sendMessage(tabId: number, message: any, responseCallback?: (response: any) => void): void;
    }

    namespace storage {
      interface StorageArea {
        get(callback: (items: { [key: string]: any }) => void): void;
        get(keys: string | string[] | { [key: string]: any } | null, callback: (items: { [key: string]: any }) => void): void;
        set(items: { [key: string]: any }, callback?: () => void): void;
        remove(keys: string | string[], callback?: () => void): void;
        clear(callback?: () => void): void;
      }

      var local: StorageArea;
      var sync: StorageArea;
    }

    namespace action {
      var onClicked: {
        addListener(callback: (tab: chrome.tabs.Tab) => void): void;
      };
    }
  }

  var chrome: typeof chrome;
}

export {};
