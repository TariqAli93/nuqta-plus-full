import installmentActionService from '../services/installmentActionService.js';

export class CollectionsController {
  async overdue(request, reply) {
    const result = await installmentActionService.listOverdue(request.query, request.user);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  }

  async installments(request, reply) {
    const result = await installmentActionService.listInstallments(request.query, request.user);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  }

  async stats(request, reply) {
    const data = await installmentActionService.getCollectionStats(request.query, request.user);
    return reply.send({ success: true, data });
  }

  async customerHistory(request, reply) {
    const data = await installmentActionService.listForCustomer(
      Number(request.params.customerId),
      request.user
    );
    return reply.send({ success: true, data });
  }
}

export default new CollectionsController();
