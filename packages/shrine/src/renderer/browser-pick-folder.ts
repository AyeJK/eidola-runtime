export type BrowserFolderPickResult =
  | { ok: true; folderName: string; engramIds: string[] }
  | { ok: false; cancelled: true }
  | { ok: false; error: string };

export function supportsBrowserFolderPicker(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}

function readIdFromEngramYaml(text: string): string | null {
  const match = text.match(/^id:\s*['"]?([^'"\n]+?)['"]?\s*$/m);
  const id = match?.[1]?.trim();
  return id || null;
}

async function readEngramIdFromHandle(dirHandle: FileSystemDirectoryHandle): Promise<string | null> {
  try {
    const fileHandle = await dirHandle.getFileHandle('engram.yaml');
    const file = await fileHandle.getFile();
    return readIdFromEngramYaml(await file.text());
  } catch {
    return null;
  }
}

async function listEngramIdsFromHandle(dirHandle: FileSystemDirectoryHandle): Promise<string[]> {
  const ids = new Set<string>();

  for await (const [, handle] of dirHandle.entries()) {
    if (handle.kind !== 'directory') {
      continue;
    }

    const subDir = handle as FileSystemDirectoryHandle;
    const directId = await readEngramIdFromHandle(subDir);
    if (directId) {
      ids.add(directId);
      continue;
    }

    for await (const [, childHandle] of subDir.entries()) {
      if (childHandle.kind !== 'directory') {
        continue;
      }

      const nestedId = await readEngramIdFromHandle(childHandle as FileSystemDirectoryHandle);
      if (nestedId) {
        ids.add(nestedId);
      }
    }
  }

  return [...ids].sort();
}

async function fingerprintFromWebkitFiles(
  files: FileList,
): Promise<{ folderName: string; engramIds: string[] }> {
  const engramIds = new Set<string>();
  let folderName = '';

  for (const file of files) {
    const parts = file.webkitRelativePath.split(/[/\\]/);
    if (parts[0]) {
      folderName = parts[0];
    }

    if (file.name !== 'engram.yaml') {
      continue;
    }

    const id = readIdFromEngramYaml(await file.text());
    if (id) {
      engramIds.add(id);
    }
  }

  return { folderName, engramIds: [...engramIds].sort() };
}

function pickFolderWithWebkitInput(): Promise<BrowserFolderPickResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.style.display = 'none';

    const cleanup = () => {
      input.remove();
    };

    input.addEventListener('change', () => {
      const files = input.files;
      cleanup();

      if (!files || files.length === 0) {
        resolve({ ok: false, cancelled: true });
        return;
      }

      void (async () => {
        const { folderName, engramIds } = await fingerprintFromWebkitFiles(files);
        if (!folderName) {
          resolve({ ok: false, error: 'Could not read the selected folder.' });
          return;
        }

        resolve({ ok: true, folderName, engramIds });
      })();
    });

    input.addEventListener('cancel', () => {
      cleanup();
      resolve({ ok: false, cancelled: true });
    });

    document.body.appendChild(input);
    input.click();
  });
}

export async function pickFolderWithBrowser(): Promise<BrowserFolderPickResult> {
  if (supportsBrowserFolderPicker()) {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      const engramIds = await listEngramIdsFromHandle(handle);
      return { ok: true, folderName: handle.name, engramIds };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { ok: false, cancelled: true };
      }

      const message = error instanceof Error ? error.message : 'Could not open folder picker.';
      return { ok: false, error: message };
    }
  }

  if ('webkitdirectory' in document.createElement('input')) {
    return pickFolderWithWebkitInput();
  }

  return {
    ok: false,
    error: 'This browser does not support folder selection. Use Chrome or Edge.',
  };
}
