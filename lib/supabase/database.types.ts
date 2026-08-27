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
          body_version: number
          created_at: string
          id: string
          is_done: boolean
          order_index: number
          work_item_id: string
        }
        Insert: {
          body: string
          body_json?: Json | null
          body_version?: number
          created_at?: string
          id?: string
          is_done?: boolean
          order_index?: number
          work_item_id: string
        }
        Update: {
          body?: string
          body_json?: Json | null
          body_version?: number
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
      access_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_value: string | null
          id: string
          kind: Database["public"]["Enums"]["access_event_kind"]
          project_id: string | null
          subject_id: string | null
          subject_label: string
          to_value: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_value?: string | null
          id?: string
          kind: Database["public"]["Enums"]["access_event_kind"]
          project_id?: string | null
          subject_id?: string | null
          subject_label: string
          to_value?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_value?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["access_event_kind"]
          project_id?: string | null
          subject_id?: string | null
          subject_label?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "access_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_events_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_events_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
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
      client_messages: {
        Row: {
          author_id: string
          body_json: Json
          body_text: string
          body_version: number
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          thread_id: string
        }
        Insert: {
          author_id: string
          body_json: Json
          body_text: string
          body_version?: number
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          thread_id: string
        }
        Update: {
          author_id?: string
          body_json?: Json
          body_text?: string
          body_version?: number
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "client_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "client_threads"
            referencedColumns: ["id"]
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
      client_thread_reads: {
        Row: {
          last_read_at: string
          profile_id: string
          thread_id: string
        }
        Insert: {
          last_read_at?: string
          profile_id: string
          thread_id: string
        }
        Update: {
          last_read_at?: string
          profile_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_thread_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_thread_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "client_thread_reads_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "client_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      client_threads: {
        Row: {
          component_id: string
          created_at: string
          id: string
          opened_by: string
          project_id: string
          resolved_at: string | null
          state: Database["public"]["Enums"]["client_thread_state"]
          title: string
          work_item_id: string | null
        }
        Insert: {
          component_id: string
          created_at?: string
          id?: string
          opened_by: string
          project_id: string
          resolved_at?: string | null
          state?: Database["public"]["Enums"]["client_thread_state"]
          title: string
          work_item_id?: string | null
        }
        Update: {
          component_id?: string
          created_at?: string
          id?: string
          opened_by?: string
          project_id?: string
          resolved_at?: string | null
          state?: Database["public"]["Enums"]["client_thread_state"]
          title?: string
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_threads_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_threads_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_threads_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "client_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_threads_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
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
          body_version: number
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          idempotency_key: string | null
          work_item_id: string
        }
        Insert: {
          author_id: string
          body_json: Json
          body_text: string
          body_version?: number
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          idempotency_key?: string | null
          work_item_id: string
        }
        Update: {
          author_id?: string
          body_json?: Json
          body_text?: string
          body_version?: number
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          idempotency_key?: string | null
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
          client_summary: string | null
          created_at: string
          icon: string | null
          id: string
          is_archived: boolean
          kind: Database["public"]["Enums"]["component_kind"]
          name: string
          project_id: string
          published_at: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          client_summary?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_archived?: boolean
          kind: Database["public"]["Enums"]["component_kind"]
          name: string
          project_id: string
          published_at?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          client_summary?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_archived?: boolean
          kind?: Database["public"]["Enums"]["component_kind"]
          name?: string
          project_id?: string
          published_at?: string | null
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
      document_revisions: {
        Row: {
          actor_id: string | null
          created_at: string
          doc: Json | null
          doc_version: number
          entity_id: string
          id: string
          page_id: string | null
          plain_text: string | null
          project_id: string | null
          restored_from: number | null
          revision_no: number
          sprint_id: string | null
          surface: Database["public"]["Enums"]["revision_surface"]
          work_item_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          doc?: Json | null
          doc_version?: number
          entity_id: string
          id?: string
          page_id?: string | null
          plain_text?: string | null
          project_id?: string | null
          restored_from?: number | null
          revision_no: number
          sprint_id?: string | null
          surface: Database["public"]["Enums"]["revision_surface"]
          work_item_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          doc?: Json | null
          doc_version?: number
          entity_id?: string
          id?: string
          page_id?: string | null
          plain_text?: string | null
          project_id?: string | null
          restored_from?: number | null
          revision_no?: number
          sprint_id?: string | null
          surface?: Database["public"]["Enums"]["revision_surface"]
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_revisions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_revisions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "document_revisions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_revisions_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_revisions_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["sprint_id"]
          },
          {
            foreignKeyName: "document_revisions_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "v_sprint_minutes"
            referencedColumns: ["sprint_id"]
          },
          {
            foreignKeyName: "document_revisions_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "v_sprint_summary"
            referencedColumns: ["sprint_id"]
          },
          {
            foreignKeyName: "document_revisions_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      favourites: {
        Row: {
          component_id: string | null
          created_at: string
          id: string
          profile_id: string
          saved_view_id: string | null
          work_item_id: string | null
        }
        Insert: {
          component_id?: string | null
          created_at?: string
          id?: string
          profile_id: string
          saved_view_id?: string | null
          work_item_id?: string | null
        }
        Update: {
          component_id?: string | null
          created_at?: string
          id?: string
          profile_id?: string
          saved_view_id?: string | null
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "favourites_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favourites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favourites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "favourites_saved_view_id_fkey"
            columns: ["saved_view_id"]
            isOneToOne: false
            referencedRelation: "saved_views"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favourites_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
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
      pages: {
        Row: {
          body: string
          body_json: Json | null
          body_version: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          project_id: string | null
          published_at: string | null
          published_by: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          body_json?: Json | null
          body_version?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          project_id?: string | null
          published_at?: string | null
          published_by?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          body_json?: Json | null
          body_version?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          project_id?: string | null
          published_at?: string | null
          published_by?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "pages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
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
      recent_views: {
        Row: {
          glyph: string
          href: string
          label: string
          opened_at: string
          profile_id: string
        }
        Insert: {
          glyph: string
          href: string
          label: string
          opened_at?: string
          profile_id: string
        }
        Update: {
          glyph?: string
          href?: string
          label?: string
          opened_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recent_views_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recent_views_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      recovery_runs: {
        Row: {
          actor_id: string | null
          checked: number
          failed: number
          findings: Json
          finished_at: string
          id: string
          preview_schema: string
          scope: string[]
          started_at: string
          status: Database["public"]["Enums"]["recovery_run_status"]
        }
        Insert: {
          actor_id?: string | null
          checked: number
          failed: number
          findings?: Json
          finished_at?: string
          id?: string
          preview_schema: string
          scope: string[]
          started_at: string
          status: Database["public"]["Enums"]["recovery_run_status"]
        }
        Update: {
          actor_id?: string | null
          checked?: number
          failed?: number
          findings?: Json
          finished_at?: string
          id?: string
          preview_schema?: string
          scope?: string[]
          started_at?: string
          status?: Database["public"]["Enums"]["recovery_run_status"]
        }
        Relationships: [
          {
            foreignKeyName: "recovery_runs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_runs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      saved_views: {
        Row: {
          created_at: string
          id: string
          is_shared: boolean
          name: string
          name_key: string | null
          owner_id: string
          project_id: string
          spec: Json
          sprint_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_shared?: boolean
          name: string
          name_key?: string | null
          owner_id: string
          project_id: string
          spec?: Json
          sprint_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_shared?: boolean
          name?: string
          name_key?: string | null
          owner_id?: string
          project_id?: string
          spec?: Json
          sprint_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "saved_views_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_sprint_in_project"
            columns: ["sprint_id", "project_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "saved_views_sprint_in_project"
            columns: ["sprint_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_person_load"
            referencedColumns: ["sprint_id", "project_id"]
          },
          {
            foreignKeyName: "saved_views_sprint_in_project"
            columns: ["sprint_id", "project_id"]
            isOneToOne: false
            referencedRelation: "v_sprint_summary"
            referencedColumns: ["sprint_id", "project_id"]
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
          notes_json: Json | null
          notes_version: number
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
          notes_json?: Json | null
          notes_version?: number
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
          notes_json?: Json | null
          notes_version?: number
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
          idempotency_key: string | null
          minutes: number
          note: string | null
          profile_id: string
          work_item_id: string
          worked_on: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key?: string | null
          minutes: number
          note?: string | null
          profile_id: string
          work_item_id: string
          worked_on?: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string | null
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
      work_item_components: {
        Row: {
          component_id: string
          created_at: string
          position: number
          work_item_id: string
        }
        Insert: {
          component_id: string
          created_at?: string
          position?: number
          work_item_id: string
        }
        Update: {
          component_id?: string
          created_at?: string
          position?: number
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_components_work_item_id_fkey"
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
          client_published_at: string | null
          client_summary: string | null
          client_title: string | null
          closed_at: string | null
          component_id: string | null
          created_at: string
          deadline: string | null
          deleted_at: string | null
          description: string | null
          description_json: Json | null
          description_version: number
          estimate_minutes: number | null
          grouping: number | null
          highlight: string | null
          highlight_json: Json | null
          highlight_version: number
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
          client_published_at?: string | null
          client_summary?: string | null
          client_title?: string | null
          closed_at?: string | null
          component_id?: string | null
          created_at?: string
          deadline?: string | null
          deleted_at?: string | null
          description?: string | null
          description_json?: Json | null
          description_version?: number
          estimate_minutes?: number | null
          grouping?: number | null
          highlight?: string | null
          highlight_json?: Json | null
          highlight_version?: number
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
          client_published_at?: string | null
          client_summary?: string | null
          client_title?: string | null
          closed_at?: string | null
          component_id?: string | null
          created_at?: string
          deadline?: string | null
          deleted_at?: string | null
          description?: string | null
          description_json?: Json | null
          description_version?: number
          estimate_minutes?: number | null
          grouping?: number | null
          highlight?: string | null
          highlight_json?: Json | null
          highlight_version?: number
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
      can_read_client_thread: {
        Args: { p_thread_id: string }
        Returns: boolean
      }
      can_write_client_thread: {
        Args: { p_thread_id: string }
        Returns: boolean
      }
      client_component_work: {
        Args: { p_component_id: string; p_project_id: string }
        Returns: {
          deadline: string
          is_done: boolean
          published_at: string
          status_label: string
          summary: string
          title: string
          work_item_id: string
        }[]
      }
      client_components: {
        Args: { p_project_id: string }
        Returns: {
          component_id: string
          done_count: number
          item_count: number
          last_activity: string
          minutes_logged: number
          name: string
          slug: string
          summary: string
        }[]
      }
      client_current_sprint: {
        Args: { p_project_id: string }
        Returns: {
          done_items: number
          ends_on: string
          goal: string
          minutes_logged: number
          name: string
          starts_on: string
          total_items: number
        }[]
      }
      client_has_capability: {
        Args: {
          p_capability: Database["public"]["Enums"]["client_capability"]
          p_project_id: string
        }
        Returns: boolean
      }
      client_projects: {
        Args: never
        Returns: {
          accent_hex: string
          client_name: string
          name: string
          project_id: string
          slug: string
        }[]
      }
      client_thread_can_reply: {
        Args: { p_thread_id: string }
        Returns: boolean
      }
      client_thread_list: {
        Args: { p_project_id?: string }
        Returns: {
          component_id: string
          component_name: string
          component_slug: string
          created_at: string
          last_message_at: string
          last_read_at: string
          message_count: number
          project_id: string
          project_slug: string
          state: string
          thread_id: string
          title: string
        }[]
      }
      client_thread_messages: {
        Args: { p_thread_id: string }
        Returns: {
          author_id: string
          author_initials: string
          author_name: string
          body_json: Json
          body_text: string
          created_at: string
          edited_at: string
          is_from_coditu: boolean
          message_id: string
        }[]
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
      primary_component_of: { Args: { p_work_item: string }; Returns: string }
      purge_deleted: {
        Args: { p_entity_id: string; p_kind: string }
        Returns: undefined
      }
      rebalance_project_keys: { Args: never; Returns: undefined }
      rehearse_recovery: { Args: { p_scope: string[] }; Returns: string }
      reorder_criteria: {
        Args: { p_criterion_id: string; p_ordered_ids: string[] }
        Returns: string
      }
      reorder_work_items: {
        Args: { p_item_id: string; p_ordered_ids: string[] }
        Returns: string
      }
      restore_comment: { Args: { p_comment_id: string }; Returns: string }
      restore_document_revision: {
        Args: {
          p_entity_id: string
          p_revision_no: number
          p_surface: Database["public"]["Enums"]["revision_surface"]
        }
        Returns: {
          revision_no: number
          sprint_id: string
          work_item_id: string
        }[]
      }
      rewrite_attachment_srcs: {
        Args: { depth?: number; doc: Json }
        Returns: Json
      }
      set_page_deleted: {
        Args: { p_deleted: boolean; p_page_id: string }
        Returns: undefined
      }
      set_work_item_deleted: {
        Args: { p_deleted: boolean; p_item_id: string }
        Returns: Json
      }
      trash_list: {
        Args: never
        Returns: {
          can_restore: boolean
          deleted_at: string
          entity_id: string
          item_key: string
          kind: string
          minutes_logged: number
          project_name: string
          project_slug: string
          sprint_number: number
          title: string
        }[]
      }
      work_item_project_id: { Args: { item_id: string }; Returns: string }
      work_item_status_rank: {
        Args: { s: Database["public"]["Enums"]["work_item_status"] }
        Returns: number
      }
    }
    Enums: {
      access_event_kind:
        | "role"
        | "activation"
        | "allowlist"
        | "client_contact"
        | "client_grant"
        | "temporary_password"
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
      client_thread_state: "waiting_client" | "waiting_coditu" | "resolved"
      component_kind: "react" | "spfx"
      recovery_run_status: "passed" | "failed"
      revision_surface:
        | "work_item_description"
        | "work_item_highlight"
        | "sprint_notes"
        | "acceptance_criterion"
        | "comment"
        | "page"
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
      access_event_kind: [
        "role",
        "activation",
        "allowlist",
        "client_contact",
        "client_grant",
        "temporary_password",
      ],
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
      client_thread_state: ["waiting_client", "waiting_coditu", "resolved"],
      component_kind: ["react", "spfx"],
      recovery_run_status: ["passed", "failed"],
      revision_surface: [
        "work_item_description",
        "work_item_highlight",
        "sprint_notes",
        "acceptance_criterion",
        "comment",
        "page",
      ],
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

