function apiNotFound(req, res) {
  return res.status(404).json({
    error: "API endpoint not found",
    request_id: req.requestId,
  });
}

module.exports = apiNotFound;
