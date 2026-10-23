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
      backgroundColor: "#151e18",
      color: "#d1deca",
    },
    ".cm-scroller": {
      fontFamily: '"SFMono-Regular",Consolas,"Liberation Mono",monospace',
      lineHeight: "1.8",
      overflow: "auto",
    },
    ".cm-content": { padding: "14px 0" },
    ".cm-gutters": {
      backgroundColor: "#151e18",
      color: "#708967",
      border: "none",
      minWidth: "44px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "#a4bd98",
    },
    ".cm-activeLine": { backgroundColor: "#ffffff03" },
    ".cm-cursor": { borderLeftColor: "#9cdec7" },
    "&.cm-focused": { outline: "none" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "#34513d",
    },
    ".cm-panels": { backgroundColor: "#243927", color: "#d4e4c9" },
    ".cm-searchMatch": { backgroundColor: "#b393464d" },
    ".cm-tooltip": {
      backgroundColor: "#2c402c",
      border: "1px solid #526748",
      color: "#d1e2c6",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "#2c412b",
      border: "none",
      color: "#acc69f",
    },
  },
  { dark: true },
);
const colors = HighlightStyle.define([
  { tag: tags.string, color: "#c1d6a0" },
  { tag: tags.number, color: "#e2b76d" },
  { tag: tags.bool, color: "#e5c58c" },
  { tag: tags.null, color: "#e5c58c" },
  { tag: tags.propertyName, color: "#9cdec7" },
  { tag: tags.keyword, color: "#e2b76d" },
  { tag: tags.comment, color: "#829977" },
  { tag: tags.tagName, color: "#e6a98b" },
  { tag: tags.attributeName, color: "#c8d299" },
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
