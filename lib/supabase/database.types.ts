export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      acceptance_criteria: {
        Row: {
          body: string
          body_json: Json | null
          created_at: string
          id: string
          is_done: boolean
          order_index: number
          work_item_id: string
        }
        Insert: {
          body: string
          body_json?: Json | null
          created_at?: string
          id?: string
          is_done?: boolean
          order_index?: number
          work_item_id: string
        }
        Update: {
          body?: string
          body_json?: Json | null
          created_at?: string
          id?: string
          is_done?: boolean
          order_index?: number
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acceptance_criteria_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      activity: {
        Row: {
          actor_id: string | null
          created_at: string
          field: string | null
          from_value: string | null
          id: string
          to_value: string | null
          verb: string
          work_item_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          field?: string | null
          from_value?: string | null
          id?: string
          to_value?: string | null
          verb: string
          work_item_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          field?: string | null
          from_value?: string | null
          id?: string
          to_value?: string | null
          verb?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "activity_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      allowed_emails: {
        Row: {
          created_at: string
          email: string
          invited_by: string | null
          note: string | null
        }
        Insert: {
          created_at?: string
          email: string
          invited_by?: string | null
          note?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          invited_by?: string | null
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allowed_emails_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allowed_emails_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      app_settings: {
        Row: {
          default_weekly_capacity_minutes: number
          hourly_rate_cents: number
          id: number
          max_image_batch: number
          max_image_bytes: number
          payout_from_sprint_id: string | null
          payout_share_threshold_pct: number
          updated_at: string
          updated_by: string | null
          usd_egp_fetched_at: string | null
          usd_egp_rate_micros: number | null
          usd_egp_source: string | null
        }
        Insert: {
          default_weekly_capacity_minutes?: number
          hourly_rate_cents?: number
          id?: number
          max_image_batch?: number
          max_image_bytes?: number
          payout_from_sprint_id?: string | null
          payout_share_threshold_pct?: number
          updated_at?: string
          updated_by?: string | null
          usd_egp_fetched_at?: string | null
          usd_egp_rate_micros?: number | null
          usd_egp_source?: string | null
        }
        Update: {
          default_weekly_capacity_minutes?: number
          hourly_rate_cents?: number
          id?: number
          max_image_batch?: number
          max_image_bytes?: number
          payout_from_sprint_id?: string | null
          payout_share_threshold_pct?: number
          updated_at?: string
          updated_by?: string | null
          usd_egp_fetched_at?: string | null
          usd_egp_rate_micros?: number | null
          usd_egp_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_payout_from_sprint_id_fkey"
            columns: ["payout_from_sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_payout_from_sprint_id_fkey"
            columns: ["payout_from_sprint_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["sprint_id"]
          },
          {
            foreignKeyName: "app_settings_payout_from_sprint_id_fkey"
            columns: ["payout_from_sprint_id"]
            isOneToOne: false
            referencedRelation: "v_sprint_minutes"
            referencedColumns: ["sprint_id"]
          },
          {
            foreignKeyName: "app_settings_payout_from_sprint_id_fkey"
            columns: ["payout_from_sprint_id"]
            isOneToOne: false
            referencedRelation: "v_sprint_summary"
            referencedColumns: ["sprint_id"]
          },
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      attachments: {
        Row: {
          bytes: number
          created_at: string
          file_name: string
          id: string
          mime_type: string
          storage_path: string
          uploaded_by: string
          work_item_id: string
        }
        Insert: {
          bytes: number
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          storage_path: string
          uploaded_by: string
          work_item_id: string
        }
        Update: {
          bytes?: number
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          storage_path?: string
          uploaded_by?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "attachments_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          accepted_at: string | null
          client_id: string
          invited_at: string
          invited_by: string | null
          profile_id: string
          revoked_at: string | null
          status: Database["public"]["Enums"]["client_contact_status"]
        }
        Insert: {
          accepted_at?: string | null
          client_id: string
          invited_at?: string
          invited_by?: string | null
          profile_id: string
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["client_contact_status"]
        }
        Update: {
          accepted_at?: string | null
          client_id?: string
          invited_at?: string
          invited_by?: string | null
          profile_id?: string
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["client_contact_status"]
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "client_contacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      client_invitation_projects: {
        Row: {
          invitation_id: string
          project_id: string
        }
        Insert: {
          invitation_id: string
          project_id: string
        }
        Update: {
          invitation_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invitation_projects_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "client_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invitation_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invitations: {
        Row: {
          accepted_profile_id: string | null
          capabilities: Database["public"]["Enums"]["client_capability"][]
          client_id: string
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          status: string
        }
        Insert: {
          accepted_profile_id?: string | null
          capabilities?: Database["public"]["Enums"]["client_capability"][]
          client_id: string
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          status?: string
        }
        Update: {
          accepted_profile_id?: string | null
          capabilities?: Database["public"]["Enums"]["client_capability"][]
          client_id?: string
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invitations_accepted_profile_id_fkey"
            columns: ["accepted_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invitations_accepted_profile_id_fkey"
            columns: ["accepted_profile_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "client_invitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      client_project_grants: {
        Row: {
          capabilities: Database["public"]["Enums"]["client_capability"][]
          contact_profile_id: string
          granted_at: string
          granted_by: string | null
          project_id: string
          revoked_at: string | null
        }
        Insert: {
          capabilities?: Database["public"]["Enums"]["client_capability"][]
          contact_profile_id: string
          granted_at?: string
          granted_by?: string | null
          project_id: string
          revoked_at?: string | null
        }
        Update: {
          capabilities?: Database["public"]["Enums"]["client_capability"][]
          contact_profile_id?: string
          granted_at?: string
          granted_by?: string | null
          project_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_project_grants_contact_profile_id_fkey"
            columns: ["contact_profile_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "client_project_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_project_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "client_project_grants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          accent_hex: string | null
          created_at: string
          id: string
          logo_path: string | null
          name: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          accent_hex?: string | null
          created_at?: string
          id?: string
          logo_path?: string | null
          name: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          accent_hex?: string | null
          created_at?: string
          id?: string
          logo_path?: string | null
          name?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      comment_mentions: {
        Row: {
          comment_id: string
          profile_id: string
        }
        Insert: {
          comment_id: string
          profile_id: string
        }
        Update: {
          comment_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_mentions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_mentions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body_json: Json
          body_text: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          work_item_id: string
        }
        Insert: {
          author_id: string
          body_json: Json
          body_text: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          work_item_id: string
        }
        Update: {
          author_id?: string
          body_json?: Json
          body_text?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "comments_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      components: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_archived: boolean
          kind: Database["public"]["Enums"]["component_kind"]
          name: string
          project_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_archived?: boolean
          kind: Database["public"]["Enums"]["component_kind"]
          name: string
          project_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_archived?: boolean
          kind?: Database["public"]["Enums"]["component_kind"]
          name?: string
          project_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "components_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          kind: string
          profile_id: string
          read_at: string | null
          work_item_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          kind: string
          profile_id: string
          read_at?: string | null
          work_item_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          profile_id?: string
          read_at?: string | null
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_kind: Database["public"]["Enums"]["account_kind"]
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          initials: string
          is_active: boolean
          is_developer: boolean
          must_set_password: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          weekly_capacity_minutes: number
        }
        Insert: {
          account_kind?: Database["public"]["Enums"]["account_kind"]
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id: string
          initials: string
          is_active?: boolean
          is_developer?: boolean
          must_set_password?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          weekly_capacity_minutes?: number
        }
        Update: {
          account_kind?: Database["public"]["Enums"]["account_kind"]
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          initials?: string
          is_active?: boolean
          is_developer?: boolean
          must_set_password?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          weekly_capacity_minutes?: number
        }
        Relationships: []
      }
      project_slug_aliases: {
        Row: {
          created_at: string
          project_id: string
          slug: string
        }
        Insert: {
          created_at?: string
          project_id: string
          slug: string
        }
        Update: {
          created_at?: string
          project_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_slug_aliases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          accent_hex: string | null
          client_id: string
          created_at: string
          id: string
          is_archived: boolean
          key_prefix: string
          name: string
          next_key_number: number
          scope: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          accent_hex?: string | null
          client_id: string
          created_at?: string
          id?: string
          is_archived?: boolean
          key_prefix: string
          name: string
          next_key_number?: number
          scope?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          accent_hex?: string | null
          client_id?: string
          created_at?: string
          id?: string
          is_archived?: boolean
          key_prefix?: string
          name?: string
          next_key_number?: number
          scope?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          profile_id: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          profile_id: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          profile_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      sprint_payout_shares: {
        Row: {
          minutes_logged: number
          payout_id: string
          profile_id: string
          share_cents: number
        }
        Insert: {
          minutes_logged: number
          payout_id: string
          profile_id: string
          share_cents: number
        }
        Update: {
          minutes_logged?: number
          payout_id?: string
          profile_id?: string
          share_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "sprint_payout_shares_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "sprint_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprint_payout_shares_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprint_payout_shares_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      sprint_payouts: {
        Row: {
          confirmed_at: string
          confirmed_by: string
          hourly_rate_cents: number
          id: string
          pot_cents: number
          sprint_id: string
          superseded_at: string | null
          superseded_by: string | null
          total_minutes: number
          usd_egp_rate_micros: number | null
          usd_egp_source: string | null
        }
        Insert: {
          confirmed_at?: string
          confirmed_by: string
          hourly_rate_cents: number
          id?: string
          pot_cents: number
          sprint_id: string
          superseded_at?: string | null
          superseded_by?: string | null
          total_minutes: number
          usd_egp_rate_micros?: number | null
          usd_egp_source?: string | null
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string
          hourly_rate_cents?: number
          id?: string
          pot_cents?: number
          sprint_id?: string
          superseded_at?: string | null
          superseded_by?: string | null
          total_minutes?: number
          usd_egp_rate_micros?: number | null
          usd_egp_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sprint_payouts_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprint_payouts_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "sprint_payouts_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprint_payouts_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["sprint_id"]
          },
          {
            foreignKeyName: "sprint_payouts_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "v_sprint_minutes"
            referencedColumns: ["sprint_id"]
          },
          {
            foreignKeyName: "sprint_payouts_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "v_sprint_summary"
            referencedColumns: ["sprint_id"]
          },
          {
            foreignKeyName: "sprint_payouts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "sprint_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      sprints: {
        Row: {
          created_at: string
          ends_on: string | null
          goal: string | null
          id: string
          name: string
          notes: string | null
          notes_author_id: string | null
          notes_written_at: string | null
          number: number
          project_id: string
          starts_on: string | null
          status: Database["public"]["Enums"]["sprint_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          goal?: string | null
          id?: string
          name: string
          notes?: string | null
          notes_author_id?: string | null
          notes_written_at?: string | null
          number: number
          project_id: string
          starts_on?: string | null
          status?: Database["public"]["Enums"]["sprint_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          goal?: string | null
          id?: string
          name?: string
          notes?: string | null
          notes_author_id?: string | null
          notes_written_at?: string | null
          number?: number
          project_id?: string
          starts_on?: string | null
          status?: Database["public"]["Enums"]["sprint_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprints_notes_author_id_fkey"
            columns: ["notes_author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprints_notes_author_id_fkey"
            columns: ["notes_author_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          id: string
          minutes: number
          note: string | null
          profile_id: string
          work_item_id: string
          worked_on: string
        }
        Insert: {
          created_at?: string
          id?: string
          minutes: number
          note?: string | null
          profile_id: string
          work_item_id: string
          worked_on?: string
        }
        Update: {
          created_at?: string
          id?: string
          minutes?: number
          note?: string | null
          profile_id?: string
          work_item_id?: string
          worked_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "time_entries_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_items: {
        Row: {
          assignee_id: string | null
          closed_at: string | null
          component_id: string | null
          created_at: string
          deadline: string | null
          deleted_at: string | null
          description: string | null
          estimate_minutes: number | null
          grouping: number | null
          highlight: string | null
          id: string
          key: string
          minutes_logged: number
          order_index: number
          reviewer_id: string | null
          sprint_id: string
          status: Database["public"]["Enums"]["work_item_status"]
          title: string
          type: Database["public"]["Enums"]["work_item_type"]
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          closed_at?: string | null
          component_id?: string | null
          created_at?: string
          deadline?: string | null
          deleted_at?: string | null
          description?: string | null
          estimate_minutes?: number | null
          grouping?: number | null
          highlight?: string | null
          id?: string
          key?: string
          minutes_logged?: number
          order_index?: number
          reviewer_id?: string | null
          sprint_id: string
          status?: Database["public"]["Enums"]["work_item_status"]
          title: string
          type?: Database["public"]["Enums"]["work_item_type"]
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          closed_at?: string | null
          component_id?: string | null
          created_at?: string
          deadline?: string | null
          deleted_at?: string | null
          description?: string | null
          estimate_minutes?: number | null
          grouping?: number | null
          highlight?: string | null
          id?: string
          key?: string
          minutes_logged?: number
          order_index?: number
          reviewer_id?: string | null
          sprint_id?: string
          status?: Database["public"]["Enums"]["work_item_status"]
          title?: string
          type?: Database["public"]["Enums"]["work_item_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "work_items_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "work_items_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["sprint_id"]
          },
          {
            foreignKeyName: "work_items_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "v_sprint_minutes"
            referencedColumns: ["sprint_id"]
          },
          {
            foreignKeyName: "work_items_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "v_sprint_summary"
            referencedColumns: ["sprint_id"]
          },
        ]
      }
    }
    Views: {
      v_person_load: {
        Row: {
          assigned_count: number | null
          full_name: string | null
          initials: string | null
          minutes_logged: number | null
          profile_id: string | null
          project_id: string | null
          review_queue_count: number | null
          role: Database["public"]["Enums"]["app_role"] | null
          sprint_id: string | null
          weekly_capacity_minutes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      v_sprint_minutes: {
        Row: {
          minutes_logged: number | null
          profile_id: string | null
          sprint_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      v_sprint_summary: {
        Row: {
          blocked_count: number | null
          changes_requested_count: number | null
          days_remaining: number | null
          done_count: number | null
          draft_count: number | null
          ends_on: string | null
          estimate_minutes: number | null
          in_peer_review_count: number | null
          in_progress_count: number | null
          in_qa_count: number | null
          item_count: number | null
          minutes_logged: number | null
          name: string | null
          number: number | null
          project_id: string | null
          ready_count: number | null
          sprint_id: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["sprint_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      allowlist_claimed: {
        Args: never
        Returns: {
          email: string
        }[]
      }
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      client_has_capability: {
        Args: {
          p_capability: Database["public"]["Enums"]["client_capability"]
          p_project_id: string
        }
        Returns: boolean
      }
      derive_key_prefix: {
        Args: { p_exclude?: string; p_slug: string }
        Returns: string
      }
      is_active_member: { Args: never; Returns: boolean }
      is_admin_or_lead: { Args: never; Returns: boolean }
      list_deleted_work_items: {
        Args: { p_sprint_id: string }
        Returns: {
          deleted_at: string
          id: string
          key: string
          minutes_logged: number
          title: string
        }[]
      }
      rebalance_project_keys: { Args: never; Returns: undefined }
      reorder_criteria: {
        Args: { p_criterion_id: string; p_ordered_ids: string[] }
        Returns: string
      }
      reorder_work_items: {
        Args: { p_item_id: string; p_ordered_ids: string[] }
        Returns: string
      }
      rewrite_attachment_srcs: {
        Args: { depth?: number; doc: Json }
        Returns: Json
      }
      set_work_item_deleted: {
        Args: { p_deleted: boolean; p_item_id: string }
        Returns: Json
      }
      work_item_project_id: { Args: { item_id: string }; Returns: string }
      work_item_status_rank: {
        Args: { s: Database["public"]["Enums"]["work_item_status"] }
        Returns: number
      }
    }
    Enums: {
      account_kind: "internal" | "client"
      app_role: "admin" | "lead" | "engineer"
      client_capability:
        | "view_project"
        | "view_components"
        | "view_work"
        | "view_current_sprint"
        | "view_past_sprints"
        | "view_criteria"
        | "view_effort"
        | "read_questions"
        | "reply_questions"
        | "start_questions"
        | "view_attachments"
      client_contact_status: "invited" | "active" | "revoked"
      component_kind: "react" | "spfx"
      sprint_status: "planned" | "active" | "closed"
      work_item_status:
        | "draft"
        | "ready"
        | "in_progress"
        | "in_peer_review"
        | "in_qa"
        | "changes_requested"
        | "done"
        | "blocked"
      work_item_type: "story" | "change_request" | "bug_fix" | "chore" | "spike"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_kind: ["internal", "client"],
      app_role: ["admin", "lead", "engineer"],
      client_capability: [
        "view_project",
        "view_components",
        "view_work",
        "view_current_sprint",
        "view_past_sprints",
        "view_criteria",
        "view_effort",
        "read_questions",
        "reply_questions",
        "start_questions",
        "view_attachments",
      ],
      client_contact_status: ["invited", "active", "revoked"],
      component_kind: ["react", "spfx"],
      sprint_status: ["planned", "active", "closed"],
      work_item_status: [
        "draft",
        "ready",
        "in_progress",
        "in_peer_review",
        "in_qa",
        "changes_requested",
        "done",
        "blocked",
      ],
      work_item_type: ["story", "change_request", "bug_fix", "chore", "spike"],
    },
  },
} as const

