/**
 * Test script to demonstrate unified tool integration in agent-flow.service
 * 
 * This script shows:
 * 1. How unified tools are discovered and used
 * 2. Enhanced logging for tool execution
 * 3. Tool source tracking (unified vs legacy)
 */

import { agentFlowService } from "./agent-flow.service";
import { unifiedToolRunnerService } from "../../../services/atoms/ToolRunnerService/unified-tool-runner.service";
import { createGeneralAgent } from "../../factories/GeneralAgent";

async function testUnifiedToolsIntegration() {
  console.log("🧪 Testing Unified Tools Integration\n");

  // 1. Check available unified tools
  console.log("1️⃣ Checking Unified Tool Registry:");
  const unifiedTools = unifiedToolRunnerService.listTools();
  console.log(`   Total unified tools: ${unifiedTools.length}`);
  
  const bySource = {
    local: unifiedTools.filter(t => t.source === 'local').length,
    mcp: unifiedTools.filter(t => t.source === 'mcp').length,
    agent: unifiedTools.filter(t => t.source === 'agent').length,
    external: unifiedTools.filter(t => t.source === 'external').length,
  };
  
  console.log("   By source:", bySource);
  console.log("   Sample tools:", unifiedTools.slice(0, 3).map(t => `${t.name} (${t.source})`));

  // 2. Test tool discovery in agent flow
  console.log("\n2️⃣ Testing Tool Discovery:");
  
  // Create a mock context
  const mockContext = {
    agentType: "general" as const,
    agent: await createGeneralAgent(),
    userMessage: "test",
    conversationId: 1,
    conversationHistory: [],
  };

  // Test tool execution with unified tool
  const mockToolCall = {
    function: {
      name: "saveMemory", // This should be in unified registry
      arguments: JSON.stringify({ content: "Test memory" })
    }
  };

  console.log(`   Looking for tool: ${mockToolCall.function.name}`);
  
  // Set up a mock send function to capture logs
  const logs: any[] = [];
  agentFlowService.setSendFunction(async (data) => {
    logs.push(data);
    console.log(`   📤 ${data.type}: ${data.content}`);
    if (data.metadata) {
      console.log(`      Metadata:`, data.metadata);
    }
  });

  try {
    // Execute tool through agent flow
    const result = await agentFlowService.executeToolForAgent({
      toolCall: mockToolCall,
      agentType: mockContext.agentType,
      agent: mockContext.agent,
      userMessage: mockContext.userMessage,
      context: mockContext,
    });

    console.log("\n   Tool execution result:", result);
    console.log(`   Captured ${logs.length} log events`);
  } catch (error) {
    console.error("   Error executing tool:", error);
  }

  // 3. Test dynamic tool list generation
  console.log("\n3️⃣ Testing Dynamic Tool List Generation:");
  
  // Clear logs
  logs.length = 0;
  
  const toolList = await agentFlowService.generateDynamicToolList(
    "general",
    mockContext.agent
  );
  
  console.log("   Tool list preview (first 500 chars):");
  console.log(toolList.substring(0, 500) + "...");
  console.log(`\n   Captured ${logs.length} log events during list generation`);

  // Clean up
  agentFlowService.clearSendFunction();
  
  console.log("\n✅ Test completed!");
}

// Run the test
testUnifiedToolsIntegration().catch(console.error);