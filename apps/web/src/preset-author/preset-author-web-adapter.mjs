import {createSubmission, portablePresetRecipe} from "./preset-author-contract.mjs";

function text(value, name, maximum) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) throw new Error(`INVALID_${name}`);
  return value.trim();
}

/**
 * Integration boundary for the existing EditorSession state. This does not persist,
 * authenticate, render or call an API. The server must derive authorUserId again from
 * its authenticated subject before accepting a submission.
 */
export function authorPreview(editorState, fields, authenticatedAuthor) {
  if (!editorState?.asset || !editorState.recipe) throw new Error("AUTHOR_ASSET_REQUIRED");
  return Object.freeze({
    lookName: text(fields.lookName, "LOOK_NAME", 120),
    description: typeof fields.description === "string" ? fields.description.trim().slice(0, 2000) : "",
    authorUserId: text(authenticatedAuthor.userId, "AUTHOR", 200),
    authorCreditName: text(authenticatedAuthor.creditName, "CREDIT_NAME", 80),
    sourceAssetId: editorState.asset.id,
    sourceRecipeRevision: editorState.revision,
    recipe: portablePresetRecipe(editorState.recipe),
    connected: false,
  });
}

export function authorSubmission(editorState, fields, authenticatedAuthor, preset) {
  if (!editorState?.asset || !editorState.recipe) throw new Error("AUTHOR_ASSET_REQUIRED");
  if (editorState.busy || editorState.exporting) throw new Error("OPERATION_IN_PROGRESS");
  if (editorState.dirty || !Number.isSafeInteger(editorState.revision) || editorState.revision < 1) {
    throw new Error("SAVED_RECIPE_REQUIRED");
  }
  const preview = authorPreview(editorState, fields, authenticatedAuthor);
  return Object.freeze({
    lookName: preview.lookName,
    description: preview.description,
    sourceAssetId: preview.sourceAssetId,
    sourceRecipeRevision: preview.sourceRecipeRevision,
    submission: createSubmission({
      presetId: preset.id,
      presetVersion: preset.version,
      authorUserId: authenticatedAuthor.userId,
      authorCreditName: authenticatedAuthor.creditName,
      recipe: editorState.recipe,
      now: fields.now,
    }),
  });
}
