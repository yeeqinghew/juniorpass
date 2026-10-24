export type FaqItem = Readonly<{ question: string; answer: string }>;

const faqData: readonly FaqItem[] = [
  {
    "question": "How to book?",
    "answer": "To book a class, simply browse our diverse range of enrichment classes and select the one you're interested in. Then proceed to checkout and use your available credits to complete the booking."
  },
  {
    "question": "How to pay?",
    "answer": "Payment for classes is done through our in-store credit system. You can purchase credits in advance and use them to book classes for your child."
  },
  {
    "question": "What are credits?",
    "answer": "Credits are the currency used on our platform. They can be used to book enrichment classes for your child. Please refer to our Credits Information page for more details."
  },
  {
    "question": "How to track bookings?",
    "answer": "You can track all your class bookings through the 'My Bookings' section on your account dashboard. There, you will see your upcoming and past classes, along with the names of your children associated with each booking."
  },
  {
    "question": "What happens if I still have unused credits inside my account?",
    "answer": "In the near future, there will be events like 1-day workshops where you can utilize 1–3 credits to clear your unused balance."
  },
  {
    "question": "I do not want to participate in any of the workshops to clear credits, I want to refund the amount back.",
    "answer": "Once the credits are purchased, no refunds can be made."
  },
  {
    "question": "Something came up on the day of the scheduled lesson, what should I do?",
    "answer": "Please contact the vendor directly to reschedule your lesson. Once confirmed, vendors will update the new lesson details on the platform."
  },
  {
    "question": "I have 3 kids, how can I track all their lessons?",
    "answer": "Our platform allows you to assign bookings to different children during sign-up. You can track each child's lessons easily through your account dashboard."
  },
  {
    "question": "Where can I use the credits?",
    "answer": "Credits can be used for all enrichment class transactions available on the Junior Pass platform."
  },
  {
    "question": "I want to be a vendor, what are the steps?",
    "answer": "You can apply to become a vendor by filling out the vendor application form with all required details. Our team will reach out to follow up. Alternatively, you can email admin@juniorpass.sg with your information."
  }
]

export default faqData;
