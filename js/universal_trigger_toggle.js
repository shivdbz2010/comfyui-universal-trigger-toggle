/**
 * Standalone Universal Trigger Toggle
 * REVISION V1.3.1 - FIX [] BUTTON + REMOVE STRENGTH TOGGLE
 * Updated: 2025-12-26 02:00:00
 */
import { app } from "../../scripts/app.js";

// --- CSS INJECTION (Clean Pill UI) ---
const style = document.createElement('style');
style.textContent = `
    .universal-tags-container {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 10px;
        background: rgba(15, 15, 20, 0.9);
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        width: 100%;
        height: 100%;
        min-height: 60px;
        overflow-y: auto;
        box-sizing: border-box;
        margin: 5px 0;
        align-items: flex-start;
        align-content: flex-start;
    }
    .universal-tag {
        padding: 0 14px;
        height: 26px;
        line-height: 26px;
        border-radius: 13px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        user-select: none;
        transition: all 0.1s ease-in-out;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.12);
        display: flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
    }
    .universal-tag.active {
        background: rgba(59, 130, 246, 0.9);
        color: white;
        border-color: #3b82f6;
        box-shadow: 0 0 8px rgba(59, 130, 246, 0.3);
    }
`;
document.head.appendChild(style);

function addTagsWidget(node, name, opts, callback) {
    const container = document.createElement("div");
    container.className = "universal-tags-container";
    let widgetValue = opts?.defaultVal || [];

    const renderTags = (tagsData, widget) => {
        container.innerHTML = "";
        if (!tagsData || tagsData.length === 0) {
            container.innerHTML = '<div style="width:100%; text-align:center; opacity:0.5; padding:20px; font-size:11px; font-style:italic;">No trigger words detected</div>';
            return;
        }
        tagsData.forEach((tag, index) => {
            const tagEl = document.createElement("div");
            tagEl.className = `universal-tag ${tag.active ? 'active' : ''}`;
            tagEl.textContent = tag.text;
            tagEl.onclick = (e) => {
                e.stopPropagation();
                widget.value[index].active = !widget.value[index].active;
                renderTags(widget.value, widget);
                if (widget.callback) widget.callback(widget.value);
            };
            container.appendChild(tagEl);
        });
    };

    const widget = node.addDOMWidget(name, "custom", container, {
        getValue: () => widgetValue,
        setValue: (v) => { widgetValue = v; renderTags(widgetValue, widget); },
        hideOnZoom: true
    });
    widget.value = widgetValue;
    widget.callback = callback;
    widget.serializeValue = () => widgetValue;
    return widget;
}

app.registerExtension({
    name: "UniversalTriggerToggle.Standalone",
    
    async nodeCreated(node) {
        if (node.comfyClass === "Universal Trigger Toggle" || node.comfyClass === "Universal Trigger Toggle (LoraManager)") {
            const self = this;
            node.serialize_widgets = true;

            // 1. ADD THE INPUT SOCKET MANUALLY
            node.addInput("trigger_words", "STRING", { "shape": 7 });

            // 2. ADD A HIDDEN WIDGET for data sync
            const hiddenWidget = node.addWidget("text", "trigger_words", "", (v) => {});
            hiddenWidget.hidden = true;
            hiddenWidget.computeSize = () => [0, -4]; 
            node.triggerWordsWidget = hiddenWidget;

            setTimeout(() => {
                const groupModeWidget = node.widgets.find(w => w.name === "group_mode");
                
                const tagWidget = addTagsWidget(node, "toggle_trigger_words", { defaultVal: [] }, () => {
                    node.setDirtyCanvas(true);
                });
                node.tagWidget = tagWidget;

            const syncFromInput = async () => {
                const input = node.inputs?.find(i => i.name === "trigger_words");
                if (!input?.link) return;

                const link = app.graph.links[input.link];
                const originNode = app.graph.getNodeById(link.origin_id);
                if (!originNode || !originNode.widgets) return;

                let raw = "";
                
                // 1. First Pass: Look for specific Lora/Trigger widgets
                for (const w of originNode.widgets) {
                    if (typeof w.value === "string" && w.value.trim()) {
                        if (w.value.includes(".safetensors") || w.name === "trigger_words" || w.name === "lora_name") {
                            raw = w.value;
                            break;
                        }
                    }
                }

                // 2. Second Pass: If still empty, take the first non-empty string widget available
                if (!raw) {
                    const stringWidget = originNode.widgets.find(w => typeof w.value === "string" && w.value.length > 0);
                    if (stringWidget) raw = stringWidget.value;
                }

                if (!raw) return;

                // ... [Rest of the processing logic remains the same] ...

                    let processed = raw;
                    try {
                        const trimmedRaw = raw.trim();
                        if (trimmedRaw.startsWith('[') || trimmedRaw.startsWith('{')) {
                            // BUG FIX: If it's just an empty array "[]", treat as empty
                            if (trimmedRaw === "[]" || trimmedRaw === "{}") {
                                processed = "";
                            } else {
                                const parsed = JSON.parse(trimmedRaw);
                                const paths = [];
                                if (Array.isArray(parsed)) {
                                    parsed.forEach(i => {
                                        if (i.lora) paths.push(i.lora);
                                        else if (typeof i === 'string' && i.endsWith('.safetensors')) paths.push(i);
                                    });
                                } else if (parsed.lora) {
                                    paths.push(parsed.lora);
                                }

                                if (paths.length > 0) {
                                    const all = [];
                                    for (const p of paths) {
                                        const n = p.split(/[\\\/]/).pop().replace(/\.safetensors$/i, "");
                                        const r = await fetch(`/api/lm/loras/get-trigger-words?name=${encodeURIComponent(n)}`);
                                        const d = await r.json();
                                        if (d.success && d.trigger_words) all.push(...d.trigger_words);
                                    }
                                    processed = all.length > 0 ? all.join(", ") : "";
                                } else {
                                    processed = ""; // Nothing found in JSON
                                }
                            }
                        } else if (raw.toLowerCase().endsWith(".safetensors")) {
                            const n = raw.split(/[\\\/]/).pop().replace(/\.safetensors$/i, "");
                            const r = await fetch(`/api/lm/loras/get-trigger-words?name=${encodeURIComponent(n)}`);
                            const d = await r.json();
                            if (d.success && d.trigger_words) processed = d.trigger_words.join(", ");
                        }
                    } catch(e) {
                        console.error("Error syncing input:", e);
                    }

                    if (node.triggerWordsWidget.value !== processed) {
                        node.triggerWordsWidget.value = processed;
                        self.updateTagsFromMessage(node, processed);
                    }
                };

                const interval = setInterval(() => {
                    if (node.graph) syncFromInput();
                    else clearInterval(interval);
                }, 800);

                if (groupModeWidget) {
                    const orig = groupModeWidget.callback;
                    groupModeWidget.callback = function() {
                        if (orig) orig.apply(this, arguments);
                        self.updateTagsFromMessage(node, node.triggerWordsWidget.value);
                    };
                }

                if (node.triggerWordsWidget.value) {
                    self.updateTagsFromMessage(node, node.triggerWordsWidget.value);
                }
                
                node.onRemoved = () => clearInterval(interval);
                node.setDirtyCanvas(true, true);
            }, 150);
        }
    },

    updateTagsFromMessage(node, message) {
        if (!node.tagWidget) return;
        const existing = {};
        (node.tagWidget.value || []).forEach(t => existing[t.text] = t);
        
        const groupMode = node.widgets.find(w => w.name === "group_mode")?.value ?? false;
        const defActive = node.widgets.find(w => w.name === "default_active")?.value ?? true;
        
        let words = [];
        if (groupMode) {
            words = message.includes(',,') ? message.split(/,{2,}/) : (message ? [message] : []);
        } else {
            words = message.replace(/,{2,}/g, ',').split(',').map(w => w.trim()).filter(x => x);
        }

        node.tagWidget.value = words.map(w => ({
            text: w,
            active: existing[w] ? existing[w].active : defActive
        }));
    }
});
