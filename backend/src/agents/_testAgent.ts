import { tool } from '@langchain/core/tools'
import { z } from "zod";
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { env } from '../config/env.config.js';
import { Annotation, MessagesAnnotation } from "@langchain/langgraph"
import { HumanMessage, SystemMessage, ToolMessage, ToolCall, type BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, END } from "@langchain/langgraph";

const llm = new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY || '',
    model: "gemini-2.0-flash"
});

const multiply = tool(
    async ({ a, b }: { a: number, b: number }) => {
        return a * b;
    },
    {
        name: "multiply",
        description: "Multiply two numbers together.",
        schema: z.object({
            a: z.number().describe("first number"),
            b: z.number().describe("second number")
        })
    }
)

const add = tool(
    async ({ a, b }: { a: number, b: number }) => {
        return a + b;
    },
    {
        name: "add",
        description: "Add the two numbers together.",
        schema: z.object({
            a: z.number().describe("first number"),
            b: z.number().describe("second number")
        })
    }
)

const divide = tool(
    async ({ a, b }: { a: number, b: number }) => {
        return a / b;
    },
    {
        name: "divide",
        description: "Divide the two numbers",
        schema: z.object({
            a: z.number().describe("first number"),
            b: z.number().describe("second number")
        })
    }
)

const tools = [add, multiply, divide]

const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

//LLM knows our available tools
const llmWithTools = llm.bindTools(tools);

//Define state
const StateAnnotation = Annotation.Root({
    ...MessagesAnnotation.spec,
    llmCalls: Annotation<number>({
        reducer: (x, y) => (y !== undefined ? y : x),
        default: () => 0,
    }),
});

//Type safe check - if message has tool_calls
function hasToolCalls(message: BaseMessage): message is BaseMessage & { tool_calls: ToolCall[] } {
    return 'tool_calls' in message &&
        Array.isArray((message as any).tool_calls) &&
        (message as any).tool_calls.length > 0;
}


// -> Make graph
//First Node
async function llmCall(state: typeof StateAnnotation.State) {
    return {
        messages: await llmWithTools.invoke([
            new SystemMessage(
                "You are a helpful assistant tasked with performing arithmetic on a set of inputs."
            ),
            ...state.messages,
        ]),
        llmCalls: (state.llmCalls ?? 0) + 1,
    };
}

//Second node - Actually calls tools
async function toolNode(state: typeof StateAnnotation.State) {
    const lastMessage = state.messages.at(-1);

    //check if last message exists and has tool_calls
    if (!lastMessage || !hasToolCalls(lastMessage)) {
        return { messages: [] };
    }

    const result: ToolMessage[] = [];
    for (const toolCall of lastMessage.tool_calls) {
        const tool = toolsByName[toolCall.name];
        const observation = await tool.invoke(toolCall);
        result.push(observation);
    }

    return {
        messages: result
    };
}

async function shouldContinue(state: typeof StateAnnotation.State) {
    const lastMessage = state.messages.at(-1);

    if (!lastMessage) return END;

    //check if the message has tool_calls property and if it has any tool calls
    if (hasToolCalls(lastMessage)) {
        return "toolNode";
    }

    //otherwise, we stop (reply to the user)
    return END;
}

const agent = new StateGraph(StateAnnotation)
    .addNode("llmCall", llmCall)
    .addNode("toolNode", toolNode)
    .addEdge(START, "llmCall")
    .addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])
    .addEdge("toolNode", "llmCall")
    .compile();

//Invoke
const result = await agent.invoke({
    messages: [new HumanMessage("Add 3 and 4. Then multiply with 10, and then add 5 and divide it by 5")],
});

for (const message of result.messages) {
    console.log(`[${message.getType()}]: ${message.content}`);
}