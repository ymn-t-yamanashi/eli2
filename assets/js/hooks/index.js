import Voicex from "./voicex.js";
import Threejs from "./three.js";
import colocatedHooks from "phoenix-colocated/llm_async"

export const Hooks = {
  Voicex: Voicex,
  colocatedHooks: colocatedHooks,
  threejs: Threejs
};
