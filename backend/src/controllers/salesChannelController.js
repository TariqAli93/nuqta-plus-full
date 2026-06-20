import { SalesChannelService } from '../services/salesChannelService.js';
import { salesChannelSchema } from '../utils/validation.js';

const salesChannelService = new SalesChannelService();

export class SalesChannelController {
  async create(request, reply) {
    const validatedData = salesChannelSchema.parse(request.body);
    const channel = await salesChannelService.create(validatedData);
    return reply.code(201).send({
      success: true,
      data: channel,
      message: 'Sales channel created successfully',
    });
  }

  async getAll(request, reply) {
    const result = await salesChannelService.getAll(request.query);
    return reply.send({
      success: true,
      data: result.data,
      meta: result.meta,
    });
  }

  async getById(request, reply) {
    const channel = await salesChannelService.getById(request.params.id);
    return reply.send({
      success: true,
      data: channel,
    });
  }

  async update(request, reply) {
    const validatedData = salesChannelSchema.partial().parse(request.body);
    const channel = await salesChannelService.update(request.params.id, validatedData);
    return reply.send({
      success: true,
      data: channel,
      message: 'Sales channel updated successfully',
    });
  }

  async delete(request, reply) {
    const result = await salesChannelService.delete(request.params.id);
    return reply.send({
      success: true,
      message: result.message,
    });
  }
}
