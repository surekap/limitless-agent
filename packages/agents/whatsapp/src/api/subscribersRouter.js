'use strict';

const { Router } = require('express');
const subscriberRepo = require('../lib/subscriberRepo');
const messageRepo    = require('../lib/messageRepo');

const router = Router();

// GET /api/subscribers
router.get('/', async (req, res) => {
  try {
    res.json(await subscriberRepo.listAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscribers
router.post('/', async (req, res) => {
  const { name, url, secret } = req.body ?? {};
  if (!name || !url) return res.status(400).json({ error: 'name and url are required' });
  try {
    res.status(201).json(await subscriberRepo.create({ name, url, secret }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/subscribers/:id
router.get('/:id', async (req, res) => {
  try {
    const sub = await subscriberRepo.getById(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Not found' });
    res.json(sub);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/subscribers/:id
router.patch('/:id', async (req, res) => {
  try {
    const sub = await subscriberRepo.update(req.params.id, req.body ?? {});
    if (!sub) return res.status(404).json({ error: 'Not found' });
    res.json(sub);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/subscribers/:id
router.delete('/:id', async (req, res) => {
  try {
    await subscriberRepo.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscribers/:id/filters
router.post('/:id/filters', async (req, res) => {
  const { chat_id, group_id } = req.body ?? {};
  if (!chat_id && !group_id)
    return res.status(400).json({ error: 'At least one of chat_id or group_id is required' });
  try {
    res.status(201).json(await subscriberRepo.addFilter(req.params.id, { chat_id, group_id }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/subscribers/:id/filters/:filterId
router.delete('/:id/filters/:filterId', async (req, res) => {
  try {
    await subscriberRepo.removeFilter(req.params.filterId);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
