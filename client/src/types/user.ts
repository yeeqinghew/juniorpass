export type UserProfile = {
  user_id: string;
  name: string;
  email: string;
  phone_number?: string | null;
  display_picture?: string | null;
  method?: string | null;
  created_at?: string | null;
  credit: number;
  credit_expires_at?: string | null;
};
