import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

const server = new McpServer({
	name: "official-krw",
	version: "1.0.0",
});

registerTools(server);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("official-krw MCP server running on stdio");
}

main().catch(console.error);
