const { v4: uuidv4 } = require('uuid');

// Guest inquiries captured from the contact form.
const inquiries = [];

function addInquiry({ name, email, message }) {
  const inquiry = {
    id: uuidv4(),
    name,
    email,
    message,
    receivedAt: new Date().toISOString()
  };
  inquiries.push(inquiry);
  return inquiry;
}

function getAllInquiries() {
  return inquiries;
}

module.exports = {
  inquiries,
  addInquiry,
  getAllInquiries
};
