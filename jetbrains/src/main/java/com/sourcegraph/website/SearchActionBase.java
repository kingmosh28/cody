package com.sourcegraph.website;

import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.PlatformDataKeys;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.editor.Caret;
import com.intellij.openapi.editor.Document;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.editor.SelectionModel;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.TextRange;
import com.intellij.openapi.vfs.VirtualFile;
import com.sourcegraph.common.BrowserOpener;
import com.sourcegraph.common.ui.DumbAwareEDTAction;
import com.sourcegraph.find.SourcegraphVirtualFile;
import com.sourcegraph.vcs.RepoInfo;
import com.sourcegraph.vcs.RepoUtil;
import com.sourcegraph.vcs.VCSType;
import java.util.logging.Level;
import java.util.logging.Logger;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public abstract class SearchActionBase extends DumbAwareEDTAction {
  public void actionPerformedMode(@NotNull AnActionEvent event, @NotNull Scope scope) {
    final Project project = event.getProject();

    Editor editor = event.getData(PlatformDataKeys.EDITOR);
    if (editor == null) {
      return;
    }
    String selectedText = getSelectedText(editor);

    if (selectedText == null || selectedText.isEmpty()) {
      return;
    }

    //noinspection ConstantConditions selectedText != null, so the editor can't be null.
    VirtualFile currentFile = editor.getVirtualFile();
    assert currentFile != null; // selectedText != null, so this can't be null.

    URLBuilder urlBuilder = new URLBuilder(project);
    if (currentFile instanceof SourcegraphVirtualFile) {
      String url;
      SourcegraphVirtualFile sourcegraphFile = (SourcegraphVirtualFile) currentFile;
      String repoUrl = (scope == Scope.REPOSITORY) ? sourcegraphFile.getRepoUrl() : null;
      url = urlBuilder.buildEditorSearchUrl(selectedText, repoUrl, null);
      BrowserOpener.INSTANCE.openInBrowser(project, url);
    } else {
      // This cannot run on EDT (Event Dispatch Thread) because it may block for a long time.
      ApplicationManager.getApplication()
          .executeOnPooledThread(
              () -> {
                String url;
                RepoInfo repoInfo = RepoUtil.getRepoInfo(project, currentFile);
                String remoteUrl = (scope == Scope.REPOSITORY) ? repoInfo.remoteUrl : null;
                String remoteBranchName =
                    (scope == Scope.REPOSITORY) ? repoInfo.remoteBranchName : null;
                if (repoInfo.vcsType == VCSType.PERFORCE) {
                  // Our "editor" backend doesn't support Perforce, but we have all the info we
                  // need, so we'll go to the final URL directly.
                  String codeHostUrl =
                      (scope == Scope.REPOSITORY) ? repoInfo.getCodeHostUrl() : null;
                  String repoName = (scope == Scope.REPOSITORY) ? repoInfo.getRepoName() : null;
                  url = urlBuilder.buildDirectSearchUrl(selectedText, codeHostUrl, repoName);
                } else {
                  url = urlBuilder.buildEditorSearchUrl(selectedText, remoteUrl, remoteBranchName);
                }
                BrowserOpener.INSTANCE.openInBrowser(project, url);
              });
    }
  }

  protected enum Scope {
    REPOSITORY,
    ANYWHERE
  }

  @Override
  public void update(@NotNull AnActionEvent event) {
    Editor editor = event.getData(PlatformDataKeys.EDITOR);
    if (editor == null) {
      return;
    }

    try {
      String selectedText = getSelectedText(editor);
      event.getPresentation().setEnabled(selectedText != null && !selectedText.isEmpty());
    } catch (Exception exception) {
      Logger logger = Logger.getLogger(SearchActionBase.class.getName());
      logger.log(Level.WARNING, "Problem while getting selected text", exception);
      event.getPresentation().setEnabled(false);
    }
  }

  @Nullable
  private String getSelectedText(Editor editor) {
    Document currentDocument = editor.getDocument();
    VirtualFile currentFile = editor.getVirtualFile();
    if (currentFile == null) {
      return null;
    }

    SelectionModel selectionModel = editor.getSelectionModel();
    String selectedText = selectionModel.getSelectedText();
    if (selectedText != null && !selectedText.isEmpty()) {
      return selectedText;
    }

    // Get whole current line, trimmed
    Caret caret = editor.getCaretModel().getCurrentCaret();
    selectedText =
        currentDocument
            .getText(new TextRange(caret.getVisualLineStart(), caret.getVisualLineEnd()))
            .trim();

    return !selectedText.isEmpty() ? selectedText : null;
  }
}
