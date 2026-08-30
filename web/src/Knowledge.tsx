import React, { useEffect, useMemo, useState } from "react";
import { type User } from "firebase/auth";
import {
  addKnowledgeItem,
  addMultipleLinks,
  deleteKnowledgeItem,
  type KnowledgeItem,
  type KnowledgeType,
  subscribeToKnowledgeItems,
  updateKnowledgeItem,
  uploadMultipleFiles,
} from "./knowledgeStore";
import Nav from "./Nav";

const TYPE_LABEL: Record<KnowledgeType, string> = {
  link: "Link",
  pdf: "PDF",
  png: "Image",
  note: "Note",
};

const FILTERS: { value: "all" | KnowledgeType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pdf", label: "PDFs" },
  { value: "png", label: "Images" },
  { value: "link", label: "Links" },
  { value: "note", label: "Notes" },
];

function emptyForm() {
  return { title: "", type: "link" as KnowledgeType, url: "", description: "", content: "" };
}

export default function Knowledge({ user: _user }: { user: User }) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [filter, setFilter] = useState<"all" | KnowledgeType>("all");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [bulkLinksOpen, setBulkLinksOpen] = useState(false);
  const [bulkLinks, setBulkLinks] = useState([{ title: "", url: "" }, { title: "", url: "" }, { title: "", url: "" }]);

  const [previewItem, setPreviewItem] = useState<KnowledgeItem | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToKnowledgeItems(setItems);
    return unsubscribe;
  }, []);

  const filteredItems = useMemo(() => {
    const list = filter === "all" ? items : items.filter((i) => i.type === filter);
    return [...list].sort((a, b) => a.title.localeCompare(b.title));
  }, [items, filter]);

  const openAddForm = () => {
    setForm(emptyForm());
    setSelectedFile(null);
    setEditingId(null);
    setFormOpen(true);
  };

  const openEditForm = (item: KnowledgeItem) => {
    setForm({ title: item.title, type: item.type, url: item.url, description: item.description || "", content: item.content || "" });
    setSelectedFile(null);
    setEditingId(item.id);
    setFormOpen(true);
  };

  const closeForm = () => setFormOpen(false);

  const handleSubmit = async () => {
    setError(null);
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    if (form.type === "link" && !form.url.trim()) {
      setError("URL is required for links");
      return;
    }
    if (!editingId && (form.type === "pdf" || form.type === "png") && !selectedFile) {
      setError("File is required for PDF/image");
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        const current = items.find((i) => i.id === editingId);
        await updateKnowledgeItem(
          editingId,
          { title: form.title, type: form.type, url: form.url, description: form.description, content: form.content, storagePath: current?.storagePath },
          selectedFile || undefined,
        );
        setNotice("Item updated");
      } else {
        await addKnowledgeItem(
          { title: form.title, type: form.type, url: form.url, description: form.description, content: form.content },
          selectedFile || undefined,
        );
        setNotice("Item added");
      }
      setFormOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save item");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: KnowledgeItem) => {
    if (!confirm(`Delete "${item.title}"?`)) return;
    try {
      await deleteKnowledgeItem(item.id, item.storagePath);
      setNotice("Item deleted");
    } catch {
      setError("Failed to delete item");
    }
  };

  const handleBulkFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const { success, failed } = await uploadMultipleFiles(e.target.files);
    setNotice(failed === 0 ? `Uploaded ${success} items` : `Uploaded ${success}, failed ${failed}`);
    e.target.value = "";
  };

  const handleBulkLinksSubmit = async () => {
    const valid = bulkLinks.filter((l) => l.title.trim() && l.url.trim());
    if (valid.length === 0) {
      setError("Enter at least one valid link");
      return;
    }
    await addMultipleLinks(valid);
    setNotice(`Added ${valid.length} links`);
    setBulkLinksOpen(false);
    setBulkLinks([{ title: "", url: "" }, { title: "", url: "" }, { title: "", url: "" }]);
  };

  return (
    <div className="page">
      <div className="card">
        <div className="header-row">
          <h1>Knowledge Library</h1>
          <div className="controls-row" style={{ marginBottom: 0 }}>
            <Nav />
          </div>
        </div>
        <p className="subtitle">Emergency access to reference docs, links, images, and notes.</p>
      </div>

      {error && <div className="card status-box warning">{error}</div>}
      {notice && <div className="card status-box">{notice}</div>}

      <div className="card">
        <div className="controls-row">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={`btn ${filter === f.value ? "btn-primary" : "btn-outline"}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button className="btn btn-outline" onClick={openAddForm}>
            + Add Item
          </button>
          <button className="btn btn-outline" onClick={() => setBulkLinksOpen(true)}>
            Bulk Links
          </button>
          <label className="btn btn-outline" style={{ margin: 0 }}>
            Bulk Files
            <input type="file" multiple accept=".pdf,image/png,image/jpeg" onChange={handleBulkFiles} style={{ display: "none" }} />
          </label>
        </div>

        {filteredItems.length === 0 ? (
          <div className="muted">No items found in this category.</div>
        ) : (
          <div className="knowledge-grid">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="knowledge-item"
                onClick={() => {
                  if (item.type === "note") openEditForm(item);
                  else if (item.type === "png") setPreviewItem(item);
                  else window.open(item.url, "_blank");
                }}
              >
                <div className="knowledge-thumb">
                  {item.type === "png" ? <img src={item.url} alt={item.title} /> : TYPE_LABEL[item.type][0]}
                </div>
                <div className="knowledge-info">
                  <div className="knowledge-title">{item.title}</div>
                  <div className="knowledge-meta">{item.description || TYPE_LABEL[item.type]}</div>
                </div>
                <div className="knowledge-actions">
                  <button
                    className="btn btn-outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditForm(item);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? "Edit Item" : "Add to Knowledge Library"}</h2>
            <label>
              Title
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label>
              Description
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label>
              Type
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as KnowledgeType })}>
                <option value="link">Hyperlink</option>
                <option value="pdf">PDF Document</option>
                <option value="png">Image</option>
                <option value="note">Note</option>
              </select>
            </label>
            {form.type === "link" && (
              <label>
                URL
                <input type="text" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
              </label>
            )}
            {(form.type === "pdf" || form.type === "png") && (
              <label>
                File {editingId && "(leave empty to keep existing)"}
                <input
                  type="file"
                  accept={form.type === "pdf" ? ".pdf" : "image/png,image/jpeg"}
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </label>
            )}
            {form.type === "note" && (
              <label>
                Content
                <textarea
                  rows={10}
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder="Start typing..."
                />
              </label>
            )}
            <div className="controls-row" style={{ justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button className="btn btn-outline" onClick={closeForm}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={submitting} onClick={handleSubmit}>
                {submitting ? "Saving..." : editingId ? "Update Item" : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkLinksOpen && (
        <div className="modal-overlay" onClick={() => setBulkLinksOpen(false)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <h2>Bulk Add Links</h2>
            {bulkLinks.map((link, i) => (
              <div key={i} className="controls-row">
                <input
                  type="text"
                  placeholder="Title"
                  value={link.title}
                  onChange={(e) => {
                    const next = [...bulkLinks];
                    next[i] = { ...next[i], title: e.target.value };
                    setBulkLinks(next);
                  }}
                />
                <input
                  type="text"
                  placeholder="https://..."
                  value={link.url}
                  onChange={(e) => {
                    const next = [...bulkLinks];
                    next[i] = { ...next[i], url: e.target.value };
                    setBulkLinks(next);
                  }}
                />
              </div>
            ))}
            <button className="btn btn-outline" onClick={() => setBulkLinks([...bulkLinks, { title: "", url: "" }])}>
              + Add Row
            </button>
            <div className="controls-row" style={{ justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button className="btn btn-outline" onClick={() => setBulkLinksOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleBulkLinksSubmit}>
                Add Links
              </button>
            </div>
          </div>
        </div>
      )}

      {previewItem && (
        <div className="modal-overlay" onClick={() => setPreviewItem(null)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <h2>{previewItem.title}</h2>
            <img src={previewItem.url} alt={previewItem.title} style={{ maxWidth: "100%", borderRadius: "0.5rem" }} />
            <div className="controls-row" style={{ justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button className="btn btn-outline" onClick={() => window.open(previewItem.url, "_blank")}>
                Open in New Tab
              </button>
              <button className="btn btn-primary" onClick={() => setPreviewItem(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
