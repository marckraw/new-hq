/**
 * Example workflows for the Orchestrator Agent
 * These demonstrate different orchestration patterns
 */

// Example 1: Parallel Execution
// User: "Analyze this image and create a written description and a marketing caption for it"
const parallelExample = {
  userMessage: "Analyze this image and create a written description and a marketing caption for it",
  expectedOrchestration: {
    strategy: "parallel",
    tools: [
      {
        name: "analyze_task",
        purpose: "Understand the task requirements"
      },
      {
        name: "execute_agents_parallel", 
        config: {
          executions: [
            {
              agent: "figma-analyzer",
              task: "Analyze this image and describe its visual elements, colors, and composition"
            },
            {
              agent: "scribe",
              task: "Create a marketing caption for a product image that will be engaging on social media"
            }
          ]
        }
      },
      {
        name: "synthesize_results",
        purpose: "Combine both outputs into a cohesive response"
      }
    ]
  }
};

// Example 2: Pipeline Execution
// User: "Research the latest AI trends, write a blog post about them, then create a summary"
const pipelineExample = {
  userMessage: "Research the latest AI trends, write a blog post about them, then create a summary",
  expectedOrchestration: {
    strategy: "pipeline",
    tools: [
      {
        name: "analyze_task",
        purpose: "Break down the multi-step task"
      },
      {
        name: "execute_agents_pipeline",
        config: {
          pipeline: [
            {
              agent: "general",
              task: "Research the latest AI trends in 2024, focusing on practical applications"
            },
            {
              agent: "scribe", 
              task: "Write a blog post about {{previousResult}}"
            },
            {
              agent: "rephraser",
              task: "Create a concise summary of this blog post: {{previousResult}}"
            }
          ]
        }
      }
    ]
  }
};

// Example 3: Conditional Routing
// User: "Help me with this Figma design" or "Help me write a blog post"
const conditionalExample = {
  userMessages: [
    "Help me optimize this Figma component for better performance",
    "Help me write a blog post about sustainable technology"
  ],
  expectedOrchestration: {
    strategy: "conditional",
    tools: [
      {
        name: "analyze_task",
        purpose: "Determine task type"
      },
      {
        name: "route_to_agent",
        config: {
          routing: [
            {
              condition: "contains:figma",
              agent: "figma-analyzer"
            },
            {
              condition: "contains:write",
              agent: "scribe"
            },
            {
              condition: "contains:code",
              agent: "general"
            }
          ],
          defaultAgent: "general"
        }
      }
    ]
  }
};

// Example 4: Complex Hybrid Workflow
// User: "Create a landing page: analyze competitor sites, design in Figma, and generate Storyblok components"
const hybridExample = {
  userMessage: "Create a landing page: analyze competitor sites, design in Figma, and generate Storyblok components",
  expectedOrchestration: {
    strategy: "hybrid",
    phases: [
      {
        phase: "Research",
        type: "parallel",
        agents: ["general", "figma-analyzer"],
        tasks: [
          "Analyze competitor landing pages for best practices",
          "Review existing Figma design patterns"
        ]
      },
      {
        phase: "Design",
        type: "pipeline",
        agents: ["figma-analyzer", "irf-architect"],
        tasks: [
          "Create Figma design based on research",
          "Convert to IRF format"
        ]
      },
      {
        phase: "Implementation", 
        type: "single",
        agent: "figma-to-storyblok",
        task: "Generate Storyblok components from the design"
      }
    ]
  }
};

// Example 5: Error Handling and Fallbacks
const errorHandlingExample = {
  userMessage: "Generate an image of a futuristic city and write a story about it",
  orchestrationWithFallback: {
    primary: {
      agent: "general",
      task: "Generate image and write story",
      fallbackOn: "image generation failure"
    },
    fallback: {
      strategy: "parallel",
      executions: [
        {
          agent: "scribe",
          task: "Write a detailed description of a futuristic city"
        },
        {
          agent: "scribe",
          task: "Write a short story set in a futuristic city"
        }
      ]
    }
  }
};

// Test function to demonstrate orchestrator capabilities
export async function testOrchestratorWorkflows() {
  console.log("=== Orchestrator Agent Workflow Examples ===\n");
  
  console.log("1. Parallel Execution Pattern:");
  console.log("   - Task:", parallelExample.userMessage);
  console.log("   - Strategy: Run multiple agents simultaneously");
  console.log("   - Benefit: Faster execution for independent tasks\n");
  
  console.log("2. Pipeline Execution Pattern:");
  console.log("   - Task:", pipelineExample.userMessage);
  console.log("   - Strategy: Chain agents where output feeds into next");
  console.log("   - Benefit: Complex multi-step workflows\n");
  
  console.log("3. Conditional Routing Pattern:");
  console.log("   - Tasks:", conditionalExample.userMessages);
  console.log("   - Strategy: Route to appropriate specialist agent");
  console.log("   - Benefit: Optimal agent selection\n");
  
  console.log("4. Hybrid Complex Workflow:");
  console.log("   - Task:", hybridExample.userMessage);
  console.log("   - Strategy: Combine parallel, pipeline, and single execution");
  console.log("   - Benefit: Handle complex, multi-phase projects\n");
  
  console.log("5. Error Handling:");
  console.log("   - Task:", errorHandlingExample.userMessage);
  console.log("   - Strategy: Fallback to alternative approach on failure");
  console.log("   - Benefit: Resilient execution\n");
}

// Export examples for testing
export const orchestratorExamples = {
  parallel: parallelExample,
  pipeline: pipelineExample,
  conditional: conditionalExample,
  hybrid: hybridExample,
  errorHandling: errorHandlingExample,
};