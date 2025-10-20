import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

const result = await generateText({
  model: openai("gpt-5"),
  prompt: "Generate a 10 word poem",
});

console.log(result.text);
