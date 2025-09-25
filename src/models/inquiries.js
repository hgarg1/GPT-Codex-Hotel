const { v4: uuidv4 } = require('uuid');

// Guest inquiries captured from the contact form.
const inquiries = [];

function addInquiry({ name, email, message }) {
  const inquiry = {
    id: uuidv4(),
    name,
    email,
    message,
    receivedAt: new Date().toISOString(),
    status: 'open',
    resolvedAt: null
  };
  inquiries.push(inquiry);
  return inquiry;
}

function getAllInquiries() {
  return inquiries;
}

function getInquiryById(id) {
  return inquiries.find((inquiry) => inquiry.id === id) || null;
}

function updateInquiryStatus(id, status) {
  const inquiry = getInquiryById(id);
  if (!inquiry) {
    return null;
  }
  inquiry.status = status;
  if (status === 'resolved') {
    inquiry.resolvedAt = new Date().toISOString();
  } else {
    inquiry.resolvedAt = null;
  }
  return inquiry;
}

module.exports = {
  inquiries,
  addInquiry,
  getAllInquiries,
  getInquiryById,
  updateInquiryStatus
};
