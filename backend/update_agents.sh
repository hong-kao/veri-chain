#!/bin/bash
# Update all agents to use OpenAI instead of Gemini

for file in src/agents/*.ts; do
    # Skip test files
    if [[ $file == *"_test"* ]] || [[ $file == *"_check"* ]]; then
        continue
    fi
    
    # Replace imports
    sed -i '' 's/import { ChatGoogleGenerativeAI } from .@langchain\/google-genai./import { ChatOpenAI } from '\''@langchain\/openai'\'';/g' "$file"
    
    # Replace model instantiation
    sed -i '' 's/new ChatGoogleGenerativeAI({/new ChatOpenAI({/g' "$file"
    sed -i '' 's/env\.GEMINI_API_KEY/env.OPENAI_API_KEY/g' "$file"
    sed -i '' 's/model: "gemini-[^"]*"/model: "gpt-4o-mini"/g' "$file"
    
    echo "Updated: $file"
done

echo "All agents updated to use OpenAI gpt-4o-mini"
