import * as vscode from "vscode";
import { CircleEditorDocument } from "./CircleEditorDocument";
import { Disposable, disposeAll } from "./dispose";
import { Balloon } from "../Utils/Balloon";
import * as fs from "fs";

export enum MessageDefs {
  // message command
  alert = "alert",
  request = "request",
  response = "response",
  pageloaded = "pageloaded",
  loadmodel = "loadmodel",
  finishload = "finishload",
  reload = "reload",
  selection = "selection",
  backendColor = "backendColor",
  error = "error",
  colorTheme = "colorTheme",
  // loadmodel type
  modelpath = "modelpath",
  uint8array = "uint8array",
  // selection
  names = "names",
  tensors = "tensors",
  // partiton of backends
  partition = "partition",

  //added by yuyeon
  edit = "edit",
  testMessage = "dd",
}

export class CircleEditorProvider
  implements vscode.CustomEditorProvider<CircleEditorDocument>
{
  public static readonly viewType = "one.editor.circle";

  //constructor
  constructor(private readonly _context: vscode.ExtensionContext) {}

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<CircleEditorDocument>
  >();
  public readonly onDidChangeCustomDocument =
    this._onDidChangeCustomDocument.event;

  private readonly webviews = new WebviewCollection();

  //register from CircleViewer
  //registerCommand excluded
  public static register(context: vscode.ExtensionContext): void {
    const provider = new CircleEditorProvider(context);

    const registrations = [
      vscode.window.registerCustomEditorProvider(
        CircleEditorProvider.viewType,
        provider,
        {
          webviewOptions: {
            retainContextWhenHidden: true,
          },
          supportsMultipleEditorsPerDocument: true,
        }
      ),
      // Add command registration here
    ];
    registrations.forEach((disposable) =>
      context.subscriptions.push(disposable)
    );
  }

  //from CircleViewer create function + add listeners
  async openCustomDocument(
    uri: vscode.Uri,
    openContext: { backupId?: string },
    _token: vscode.CancellationToken
  ): Promise<CircleEditorDocument> {
    let bytes = new Uint8Array(await vscode.workspace.fs.readFile(uri));

    const document: CircleEditorDocument = await CircleEditorDocument.create(
      uri,
      bytes
    );

    const listeners: vscode.Disposable[] = [];

    listeners.push(
      document.onDidChangeDocument((e) => {
        // Tell VS Code that the document has been edited by the use.
        this._onDidChangeCustomDocument.fire({
          document,
          ...e,
        });
      })
    );

    listeners.push(
      document.onDidChangeContent((e) => {
        // Update all webviews when the document changes
        for (const webviewPanel of this.webviews.get(document.uri)) {
          // 나중에 고치기
          // multiMode 패킷 분리해서 보내기
          this.postMessage(webviewPanel, "message", { modelData: e.modelData });
        }
      })
    );

    document.onDidDispose(() => disposeAll(listeners));
    return document;
  }

  resolveCustomEditor(
    document: CircleEditorDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    this.webviews.add(document.uri, webviewPanel);

    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    webviewPanel.webview.onDidReceiveMessage((e) =>
      this.onMessage(document, e)
    );
  }

  saveCustomDocument(
    document: CircleEditorDocument,
    cancellation: vscode.CancellationToken
  ): Thenable<void> {
    return document.save(cancellation);
  }
  saveCustomDocumentAs(
    document: CircleEditorDocument,
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken
  ): Thenable<void> {
    return document.saveAs(destination, cancellation);
  }
  revertCustomDocument(
    document: CircleEditorDocument,
    cancellation: vscode.CancellationToken
  ): Thenable<void> {
    return document.revert(cancellation);
  }
  backupCustomDocument(
    document: CircleEditorDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken
  ): Thenable<vscode.CustomDocumentBackup> {
    return document.backup(context.destination, cancellation);
  }

  private postMessage(
    panel: vscode.WebviewPanel,
    type: string,
    body: any
  ): void {
    panel.webview.postMessage({ type, body });
  }

  private onMessage(document: CircleEditorDocument, message: any) {
   

    //원래 있던 메시지들 그냥 return 해도 되는지
    switch (message.command) {
      case MessageDefs.alert:
        Balloon.error(message.text);
        return;
      case MessageDefs.request:
        //return Document.StateModel
        return;
      case MessageDefs.pageloaded:
        return;
      case MessageDefs.loadmodel:
        //multi model mode 필요한지 보류
        return;
      case MessageDefs.finishload:
        return;
      case MessageDefs.selection:
        return;

      //added new logics
      case MessageDefs.edit:
        document.makeEdit(message);
        return;
      case "test": {
        console.log("msg arrived here");
        document.makeEdit(message);
        return;
      }
    }
  }

  //getHtml
  private getHtmlForWebview(webview: vscode.Webview): string {
    //need to get html from GUI
    //this is temporary html for testing
    // 나중에 수정
    const htmlUrl = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._context.extensionUri,
        "media",
        "CircleEditorTest",
        "index.html"
      )
    );
    let html = fs.readFileSync(htmlUrl.fsPath, { encoding: "utf-8" });

    return html;
  }
}

class WebviewCollection {
  private readonly _webviews = new Set<{
    readonly resource: string;
    readonly webviewPanel: vscode.WebviewPanel;
  }>();

  /**
   * Get all known webviews for a given uri.
   */
  public *get(uri: vscode.Uri): Iterable<vscode.WebviewPanel> {
    const key = uri.toString();

    console.log("webview Collection get 함수 내부 ");

    for (const entry of this._webviews) {
      if (entry.resource === key) {
        yield entry.webviewPanel;
      }
    }
  }

  /**
   * Add a new webview to the collection.
   */
  public add(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel) {
    const entry = { resource: uri.toString(), webviewPanel };
    this._webviews.add(entry);

    webviewPanel.onDidDispose(() => {
      this._webviews.delete(entry);
    });
  }
}
