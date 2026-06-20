import { OnlineOrderService } from '../services/onlineOrderService.js';
import {
  onlineOrderSchema,
  onlineOrderStatusSchema,
  onlineOrderConvertSchema,
} from '../utils/validation.js';

const onlineOrderService = new OnlineOrderService();

export class OnlineOrderController {
  async create(request, reply) {
    const validatedData = onlineOrderSchema.parse(request.body);
    const order = await onlineOrderService.create(validatedData, request.user?.id);
    return reply.code(201).send({
      success: true,
      data: order,
      message: 'Online order created successfully',
    });
  }

  async getAll(request, reply) {
    const result = await onlineOrderService.getAll(request.query);
    return reply.send({
      success: true,
      data: result.data,
      meta: result.meta,
    });
  }

  async getById(request, reply) {
    const order = await onlineOrderService.getById(request.params.id);
    return reply.send({
      success: true,
      data: order,
    });
  }

  async update(request, reply) {
    const validatedData = onlineOrderSchema.partial().parse(request.body);
    const order = await onlineOrderService.update(request.params.id, validatedData);
    return reply.send({
      success: true,
      data: order,
      message: 'Online order updated successfully',
    });
  }

  async updateStatus(request, reply) {
    const { status, note } = onlineOrderStatusSchema.parse(request.body);
    const order = await onlineOrderService.updateStatus(
      request.params.id,
      status,
      request.user?.id,
      note ?? null
    );
    return reply.send({
      success: true,
      data: order,
      message: 'Online order status updated successfully',
    });
  }

  async convert(request, reply) {
    const options = onlineOrderConvertSchema.parse(request.body || {});
    const result = await onlineOrderService.convertToSale(
      request.params.id,
      options,
      request.user
    );
    return reply.code(201).send({
      success: true,
      data: result,
      message: 'Online order converted to sale successfully',
    });
  }

  async delete(request, reply) {
    const result = await onlineOrderService.delete(request.params.id);
    return reply.send({
      success: true,
      message: result.message,
    });
  }
}
