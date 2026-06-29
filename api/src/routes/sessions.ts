import { FastifyInstance } from 'fastify'

// In-memory active sessions aren't accessible from the API process
// The collector holds them. For now we return a placeholder.
// Phase 3 will expose live sessions via the WebSocket endpoint.

export async function sessionRoutes(app: FastifyInstance) {
  app.get('/sessions/live', async () => {
    return {
      sessions: [],
      note: 'Live sessions available via WebSocket at /ws/live',
    }
  })
}