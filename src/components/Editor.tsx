import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
  HighlightStyle,
} from "@codemirror/language";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { html } from "@codemirror/lang-html";
import { tags } from "@lezer/highlight";
const theme = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "12px",
      backgroundColor: "#101318",
      color: "#d2dbea",
    },
    ".cm-scroller": {
      fontFamily: '"SFMono-Regular",Consolas,"Liberation Mono",monospace',
      lineHeight: "1.8",
      overflow: "auto",
    },
    ".cm-content": { padding: "14px 0" },
    ".cm-gutters": {
      backgroundColor: "#101318",
      color: "#8190a5",
      border: "none",
      minWidth: "44px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "#b8c4d6",
    },
    ".cm-activeLine": { backgroundColor: "#ffffff03" },
    ".cm-cursor": { borderLeftColor: "#60a5fa" },
    "&.cm-focused": { outline: "none" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "#374151",
    },
    ".cm-panels": { backgroundColor: "#29313f", color: "#d2dbea" },
    ".cm-searchMatch": { backgroundColor: "#8190a54d" },
    ".cm-tooltip": {
      backgroundColor: "#29313f",
      border: "1px solid #475569",
      color: "#d2dbea",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "#29313f",
      border: "none",
      color: "#b8c4d6",
    },
  },
  { dark: true },
);
const colors = HighlightStyle.define([
  { tag: tags.string, color: "#a8d5a2" },
  { tag: tags.number, color: "#d6bd88" },
  { tag: tags.bool, color: "#b4a1de" },
  { tag: tags.null, color: "#b4a1de" },
  { tag: tags.propertyName, color: "#8dc6ee" },
  { tag: tags.keyword, color: "#a7bdfa" },
  { tag: tags.comment, color: "#8190a5" },
  { tag: tags.tagName, color: "#ddabab" },
  { tag: tags.attributeName, color: "#c7c58e" },
]);
export default function Editor({
  value,
  onChange,
  language = "json",
  readOnly = false,
  variables = [],
}: {
  value: string;
  onChange?: (v: string) => void;
  language?: string;
  readOnly?: boolean;
  variables?: string[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const vars = useRef(variables);
  vars.current = variables;
  const languageConfig = useRef(new Compartment());
  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          bracketMatching(),
          foldGutter(),
          closeBrackets(),
          highlightSelectionMatches(),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...searchKeymap,
            ...closeBracketsKeymap,
            indentWithTab,
          ]),
          languageConfig.current.of(
            language === "xml" ? xml() : language === "html" ? html() : json(),
          ),
          syntaxHighlighting(colors),
          theme,
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) change.current?.(u.state.doc.toString());
          }),
          autocompletion({
            override: [
              (context) => {
                const word = context.matchBefore(/\{\{[\w-]*/);
                if (!word) return null;
                return {
                  from: word.from,
                  options: vars.current.map((v) => ({
                    label: `{{${v}}}`,
                    type: "variable",
                  })),
                };
              },
            ],
          }),
          EditorView.contentAttributes.of({
            "aria-label": readOnly
              ? "Response body editor"
              : "Request body editor",
            spellcheck: "false",
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // Editor lifetime is independent of parent renders; document changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value)
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: value },
      });
  }, [value]);
  useEffect(() => {
    view.current?.dispatch({
      effects: languageConfig.current.reconfigure(
        language === "xml"
          ? xml()
          : language === "html"
            ? html()
            : language === "text"
              ? []
              : json(),
      ),
    });
  }, [language]);
  return <div className="code-editor" ref={host} />;
}
