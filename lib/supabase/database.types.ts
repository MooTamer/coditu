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
          created_at: string
          id: string
          is_done: boolean
          order_index: number
          work_item_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_done?: boolean
          order_index?: number
          work_item_id: string
        }
        Update: {
          body?: string
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
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          initials: string
          is_active: boolean
          must_set_password: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          weekly_capacity_minutes: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id: string
          initials: string
          is_active?: boolean
          must_set_password?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          weekly_capacity_minutes?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          initials?: string
          is_active?: boolean
          must_set_password?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          weekly_capacity_minutes?: number
        }
        Relationships: []
      }
      projects: {
        Row: {
          accent_hex: string | null
          client_id: string
          created_at: string
          id: string
          is_archived: boolean
          name: string
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
          name: string
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
          name?: string
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
          created_at: string
          deadline: string | null
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
          created_at?: string
          deadline?: string | null
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
          created_at?: string
          deadline?: string | null
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
      v_sprint_summary: {
        Row: {
          blocked_count: number | null
          changes_requested_count: number | null
          days_remaining: number | null
          dev_started_count: number | null
          done_count: number | null
          draft_count: number | null
          ends_on: string | null
          estimate_minutes: number | null
          in_review_count: number | null
          item_count: number | null
          minutes_logged: number | null
          name: string | null
          number: number | null
          project_id: string | null
          ready_for_peer_review_count: number | null
          sprint_id: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["sprint_status"] | null
          todo_count: number | null
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
      is_active_member: { Args: never; Returns: boolean }
      is_admin_or_lead: { Args: never; Returns: boolean }
      reorder_work_items: {
        Args: { p_item_id: string; p_ordered_ids: string[] }
        Returns: string
      }
      work_item_project_id: { Args: { item_id: string }; Returns: string }
      work_item_status_rank: {
        Args: { s: Database["public"]["Enums"]["work_item_status"] }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "lead" | "engineer"
      sprint_status: "planned" | "active" | "closed"
      work_item_status:
        | "draft"
        | "todo"
        | "dev_started"
        | "ready_for_peer_review"
        | "in_review"
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
      app_role: ["admin", "lead", "engineer"],
      sprint_status: ["planned", "active", "closed"],
      work_item_status: [
        "draft",
        "todo",
        "dev_started",
        "ready_for_peer_review",
        "in_review",
        "changes_requested",
        "done",
        "blocked",
      ],
      work_item_type: ["story", "change_request", "bug_fix", "chore", "spike"],
    },
  },
} as const

