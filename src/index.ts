import { createEditor, languageMap } from "prism-code-editor";
import { languages } from "prism-code-editor/prism";
import { matchBrackets } from "prism-code-editor/match-brackets";
import { highlightBracketPairs } from "prism-code-editor/highlight-brackets";
import { highlightSelectionMatches, searchWidget } from "prism-code-editor/search";
import { defaultCommands, editHistory } from "prism-code-editor/commands";
import { cursorPosition } from "prism-code-editor/cursor";
import { getLineBefore } from "prism-code-editor/utils";
import { saveAs } from 'file-saver';
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit";
import init, { compile } from "./halcyon_lib.js";

import "prism-code-editor/layout.css";
import "prism-code-editor/themes/prism-okaidia.css";
import "prism-code-editor/scrollbar.css";
import "@xterm/xterm/css/xterm.css"


const editor_storage_key = "editor-contents";
const zoom_storage_key = "zoom-level";

languageMap.halcyon = {
  comments: {
    line: "--",
    block: ["(*", "*)"],
  },
  autoIndent: [
    ([start], value) =>
      // brackets
      /[([{][^)\]}]*$/.test(getLineBefore(value, start)) ||
      // module | let | type
      /\b(?:module|let|type|do)\b [\s\S]+=\s*$/.test(getLineBefore(value, start)) ||
      // do
      /\bdo\s*$/.test(getLineBefore(value, start)),

    
    ([start, end], value) => /\[]|\(\)|{}/.test(value[start - 1] + value[end]),
  ],
};

languages["halcyon"] = {
  'comment': [
    /\(\*[\s\S]*?\*\)/,
    {
      pattern: /--.*/g,
      greedy: true
    }
  ],
	'char': {
		pattern: /'(?:[^\\\n']|\\(?:.|[ox]?[a-f\d]{1,3}))'/gi,
		greedy: true
	},
	'string': {
		pattern: /"(?:\\[\s\S]|[^\\\n"])*"|\{([a-z_]*)\|[\s\S]*?\|\1\}/g,
		greedy: true
	},
	'number': [
		// binary and octal
		/\b(?:0b[01][01_]*|0o[0-7][0-7_]*)\b/i,
		// hexadecimal
		/\b0x[a-f\d][a-f\d_]*(?:\.[a-f\d_]*)?(?:p[+-]?\d[\d_]*)?(?!\w)/i,
		// decimal
		/\b\d[\d_]*(?:\.[\d_]*)?(?:e[+-]?\d[\d_]*)?(?!\w)/i,
	],
	'keyword': /\b(?:module|end|let|type|do|fn|if|then|else|match|with|in|and|or|xor|not|of)\b/,
	'operator': /[+-/*\.=\|><,:\(\)\[\]\{\}]/,
	'boolean': /\b(?:true|false)\b/,
};

const default_code = `(* Halcyon FizzBuzz example *)
module example =
  let fizzbuzz = fn number max =>
    (match (number % 3, number % 5) with
      | (0, 0) => "FizzBuzz"
      | (0, _) => "Fizz"
      | (_, 0) => "Buzz"
      | (_, _) => format::integer number)
	|> std::println;
    if number < max then
      fizzbuzz (number + 1) max
    else
      ()

  do fizzbuzz 1 30
end`;

let text = sessionStorage.getItem(editor_storage_key) ?? default_code;
let zoom = Number(sessionStorage.getItem(zoom_storage_key) ?? "1");
let binary: Uint8Array | null  = null;

createEditor(
  "#editor",
  {
    value: text,
    onUpdate(this, input) {
      sessionStorage.setItem(editor_storage_key, input);
      text = input;
      binary = null;
    },
    language: "halcyon",
  },
  highlightSelectionMatches(),
  searchWidget(),
  defaultCommands(),
  cursorPosition(),
  editHistory(),
  highlightBracketPairs(),
  matchBrackets(),
);

let term = new Terminal();
let fit = new FitAddon();
term.loadAddon(fit);
term.open(document.getElementById("console")!);
term.writeln("Welcome to the online Halcyon IDE");
fit.fit();

const zoom_in_button = document.getElementById("zoom-in-button")!;
const zoom_out_button = document.getElementById("zoom-out-button")!;
const editor_element = document.getElementsByClassName("prism-code-editor")[0]! as HTMLElement;
editor_element.style.setProperty("font-size", `${zoom}em`);

zoom_out_button.onclick = () => {
  zoom -= 0.1;
  zoom = zoom <= 0 ? 0.1 : zoom;
  editor_element.style.setProperty("font-size", `${zoom}em`);
  sessionStorage.setItem(zoom_storage_key, String(zoom));
};
zoom_in_button.onclick = () => {
  zoom += 0.1;
  editor_element.style.setProperty("font-size", `${zoom}em`);
  sessionStorage.setItem(zoom_storage_key, String(zoom));
};

const compile_button = document.getElementById("compile-button")! as HTMLButtonElement;
const run_button = document.getElementById("run-button")! as HTMLButtonElement;
const save_button = document.getElementById("save-button")! as HTMLButtonElement;
const copy_button = document.getElementById("copy-button")! as HTMLButtonElement;

save_button.onclick = () => {
  let file = new File([text], "source.hc", {type: "text/plain;charset=utf-8"});
  saveAs(file, "source.hc");
};

copy_button.onclick = () => {
  navigator.clipboard.writeText(text);
};

await init();
// Wait to enable buttons until WASM is loaded
compile_button.disabled = false;
run_button.disabled = false;

let compile_code = () => {
  term.clear();
  try {
    binary = compile(text);
  } catch(e) {
    (e as string).split('\n').forEach((s) => term.writeln(s));
    binary = null;
    return false;
  }
  term.writeln("Compiled Successfully");
  return true;
}

compile_button.onclick = compile_code;
run_button.onclick = () => {
  term.clear();
  if (binary === null && !compile_code()) {
    return;
  }
  const memory = new WebAssembly.Memory({initial: 1});
  const print_string = (_offset: bigint, _length: bigint) => {
    const offset = Number(_offset);
    const length = Number(_length);
    const bytes = new Uint8Array(memory.buffer, offset, length);
    const string = new TextDecoder("utf8").decode(bytes);
    string.split('\n').forEach((s) => {
        if (s != "") {
          term.writeln(s);
        }
    });
  }
  const imports = {
    sys: {
      memory: memory,
      print_string: print_string,
    }
  };
  try {
    WebAssembly.instantiate(binary!, imports);
  } catch(e) {
    term.writeln("The program has crashed with the message:\n" + e.toString());
  };
};
