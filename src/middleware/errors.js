const { HOTEL_NAME } = require('../utils/constants');

function notFoundHandler(req, res, next) {
  res.status(404);
  return res.render('404', {
    pageTitle: 'Signal Lost',
    hotelName: HOTEL_NAME
  });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err.code === 'EBADCSRFTOKEN') {
    req.pushAlert('danger', 'Security token expired. Please try submitting the form again.');
    const fallback = req.get('referer') || '/';
    return res.redirect(fallback);
  }

  console.error(err); // eslint-disable-line no-console
  const status = err.status || 500;
  res.status(status);
  return res.render('500', {
    pageTitle: 'System Glitch',
    hotelName: HOTEL_NAME,
    status
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
