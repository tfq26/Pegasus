/**
 * Classifies a list of files and suggests actions (Spreadsheet, Database, Note, File, Skip).
 * Deterministic version - avoids AI overhead for simple file categorization.
 */
export async function classifyFiles(files, context = {}) {
  if (!files || files.length === 0) return [];

  return files.map(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    const name = f.name.toLowerCase();

    let action = 'file';
    let reasoning = 'General file storage';
    let options = {};

    // 1. Skip system files
    if (name === '.ds_store' || name === 'thumbs.db' || name.startsWith('__macosx')) {
      action = 'skip';
      reasoning = 'System file/meta-data';
    }
    // 2. Spreadsheets (DuckDB)
    else if (['xlsx', 'xls', 'csv'].includes(ext)) {
      action = 'spreadsheet';
      reasoning = 'Tabular data file';
      options = {
        tableName: f.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()
      };
    }
    // 3. Databases
    else if (['db', 'sqlite', 'sqlite3', 'duckdb'].includes(ext)) {
      action = 'database';
      reasoning = 'Structured database file';
      options = { nickname: f.name.replace(/\.[^/.]+$/, "") };
    }
    // 4. Notes
    else if (['md', 'txt', 'rtf'].includes(ext)) {
      action = 'note';
      reasoning = 'Text-based document';
      options = { title: f.name.replace(/\.[^/.]+$/, "") };
    }
    // 5. Rich Documents (PDF, Docx)
    else if (['pdf', 'docx', 'doc', 'pptx', 'ppt'].includes(ext)) {
      action = 'file';
      reasoning = 'Document for RAG indexing';
      options = { title: f.name.replace(/\.[^/.]+$/, "") };
    }

    return {
      filename: f.name,
      suggested_action: action,
      reasoning: reasoning,
      options: options
    };
  });
}
