import browser from "webextension-polyfill";

/** Native transfers survive popup closure; the browser owns file storage.
 * No cookies or authorization headers are extracted or copied.
 */
export class NativeDownloadAdapter {
    async start(link: string, suggestedName?: string | null): Promise<number> {
        const url = new URL(link);
        if (!["http:", "https:"].includes(url.protocol)) {
            throw new Error("Use um endereço HTTP ou HTTPS.");
        }
        if (url.username || url.password) {
            throw new Error("Não inclua credenciais no endereço.");
        }
        const filename = suggestedName
            ? suggestedName.replace(/[\\/<>:"|?*\u0000-\u001f]/g, "_").replace(/^\.+/, "_").trim()
            : undefined;
        return browser.downloads.download({
            url: url.href,
            ...(filename ? { filename } : {}),
            conflictAction: "uniquify",
            saveAs: false,
        });
    }

    async get(id: number) {
        const [item] = await browser.downloads.search({ id });
        if (!item) throw new Error("Download não encontrado.");
        return item;
    }

    async pause(id: number): Promise<void> {
        const item = await this.get(id);
        if (item.state !== "in_progress" || item.paused) {
            throw new Error("Este download não pode ser pausado agora.");
        }
        await browser.downloads.pause(id);
    }

    async resume(id: number): Promise<void> {
        const item = await this.get(id);
        if (!item.canResume) {
            throw new Error("O navegador não permite retomar este download.");
        }
        await browser.downloads.resume(id);
    }

    async cancel(id: number): Promise<void> {
        const item = await this.get(id);
        if (item.state !== "in_progress") return;
        await browser.downloads.cancel(id);
    }
}
