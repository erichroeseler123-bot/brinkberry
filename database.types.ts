export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      canonical_events: {
        Row: {
          age_restriction: string | null
          canonical_image_url: string | null
          canonical_url: string
          category_tags: string[]
          created_at: string
          deleted_at: string | null
          description: string | null
          end_time: string | null
          event_status: string
          id: string
          indoor_outdoor: string
          is_recurring: boolean
          last_verified_at: string | null
          normalized_title: string
          price_currency: string
          price_display: string | null
          price_max: number | null
          price_min: number | null
          price_status: string
          recurrence_rule: string | null
          start_time: string
          timezone: string
          title: string
          updated_at: string
          venue_id: string
          verification_status: string
          vibe_labels: string[]
        }
        Insert: {
          age_restriction?: string | null
          canonical_image_url?: string | null
          canonical_url: string
          category_tags?: string[]
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_time?: string | null
          event_status?: string
          id?: string
          indoor_outdoor?: string
          is_recurring?: boolean
          last_verified_at?: string | null
          normalized_title: string
          price_currency?: string
          price_display?: string | null
          price_max?: number | null
          price_min?: number | null
          price_status?: string
          recurrence_rule?: string | null
          start_time: string
          timezone?: string
          title: string
          updated_at?: string
          venue_id: string
          verification_status?: string
          vibe_labels?: string[]
        }
        Update: {
          age_restriction?: string | null
          canonical_image_url?: string | null
          canonical_url?: string
          category_tags?: string[]
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_time?: string | null
          event_status?: string
          id?: string
          indoor_outdoor?: string
          is_recurring?: boolean
          last_verified_at?: string | null
          normalized_title?: string
          price_currency?: string
          price_display?: string | null
          price_max?: number | null
          price_min?: number | null
          price_status?: string
          recurrence_rule?: string | null
          start_time?: string
          timezone?: string
          title?: string
          updated_at?: string
          venue_id?: string
          verification_status?: string
          vibe_labels?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "canonical_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      community_events: {
        Row: {
          active: boolean
          address: string | null
          category: string
          city: string
          created_at: string
          description: string | null
          end_time: string | null
          id: string
          lat: number | null
          lon: number | null
          manage_token: string
          price_display: string
          price_high: number | null
          price_low: number | null
          source: string
          start_time: string
          submitter_email: string | null
          ticket_url: string
          title: string
          venue: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          category?: string
          city?: string
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          lat?: number | null
          lon?: number | null
          manage_token?: string
          price_display?: string
          price_high?: number | null
          price_low?: number | null
          source?: string
          start_time: string
          submitter_email?: string | null
          ticket_url?: string
          title: string
          venue: string
        }
        Update: {
          active?: boolean
          address?: string | null
          category?: string
          city?: string
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          lat?: number | null
          lon?: number | null
          manage_token?: string
          price_display?: string
          price_high?: number | null
          price_low?: number | null
          source?: string
          start_time?: string
          submitter_email?: string | null
          ticket_url?: string
          title?: string
          venue?: string
        }
        Relationships: []
      }
      event_review_queue: {
        Row: {
          canonical_event_id: string | null
          created_at: string
          id: string
          notes: string | null
          resolved_at: string | null
          review_type: string
          source_event_id: string | null
          status: string
        }
        Insert: {
          canonical_event_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          resolved_at?: string | null
          review_type: string
          source_event_id?: string | null
          status?: string
        }
        Update: {
          canonical_event_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          resolved_at?: string | null
          review_type?: string
          source_event_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_review_queue_canonical_event_id_fkey"
            columns: ["canonical_event_id"]
            isOneToOne: false
            referencedRelation: "canonical_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_review_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "source_events"
            referencedColumns: ["id"]
          },
        ]
      }
      source_events: {
        Row: {
          canonical_event_id: string | null
          created_at: string
          external_id: string | null
          fetched_at: string
          id: string
          latitude: number | null
          longitude: number | null
          parse_confidence: number
          parse_error: string | null
          parsed_address: string | null
          parsed_end_time: string | null
          parsed_start_time: string | null
          parsed_title: string | null
          parsed_venue_name: string | null
          raw_payload: Json
          source_id: string
          source_url: string
          status: string
          updated_at: string
        }
        Insert: {
          canonical_event_id?: string | null
          created_at?: string
          external_id?: string | null
          fetched_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          parse_confidence?: number
          parse_error?: string | null
          parsed_address?: string | null
          parsed_end_time?: string | null
          parsed_start_time?: string | null
          parsed_title?: string | null
          parsed_venue_name?: string | null
          raw_payload?: Json
          source_id: string
          source_url: string
          status?: string
          updated_at?: string
        }
        Update: {
          canonical_event_id?: string | null
          created_at?: string
          external_id?: string | null
          fetched_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          parse_confidence?: number
          parse_error?: string | null
          parsed_address?: string | null
          parsed_end_time?: string | null
          parsed_start_time?: string | null
          parsed_title?: string | null
          parsed_venue_name?: string | null
          raw_payload?: Json
          source_id?: string
          source_url?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_events_canonical_event_id_fkey"
            columns: ["canonical_event_id"]
            isOneToOne: false
            referencedRelation: "canonical_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_health_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          event_count: number | null
          fetch_finished_at: string | null
          fetch_started_at: string
          id: number
          source_id: string
          success: boolean
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_count?: number | null
          fetch_finished_at?: string | null
          fetch_started_at: string
          id?: number
          source_id: string
          success: boolean
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_count?: number | null
          fetch_finished_at?: string | null
          fetch_started_at?: string
          id?: number
          source_id?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "source_health_logs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          auth_required: boolean
          categories: string[]
          consecutive_failures: number
          created_at: string
          expected_event_yield: number | null
          feed_url: string | null
          geography: Json | null
          homepage_url: string | null
          id: string
          is_active: boolean
          last_failure_at: string | null
          last_failure_reason: string | null
          last_fetch_started_at: string | null
          last_successful_fetch_at: string | null
          name: string
          notes: string | null
          parser_config: Json
          parser_version: string | null
          reliability_score: number
          slug: string
          source_authority: string
          source_priority: number
          type: string
          updated_at: string
        }
        Insert: {
          auth_required?: boolean
          categories?: string[]
          consecutive_failures?: number
          created_at?: string
          expected_event_yield?: number | null
          feed_url?: string | null
          geography?: Json | null
          homepage_url?: string | null
          id?: string
          is_active?: boolean
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_fetch_started_at?: string | null
          last_successful_fetch_at?: string | null
          name: string
          notes?: string | null
          parser_config?: Json
          parser_version?: string | null
          reliability_score?: number
          slug: string
          source_authority?: string
          source_priority?: number
          type: string
          updated_at?: string
        }
        Update: {
          auth_required?: boolean
          categories?: string[]
          consecutive_failures?: number
          created_at?: string
          expected_event_yield?: number | null
          feed_url?: string | null
          geography?: Json | null
          homepage_url?: string | null
          id?: string
          is_active?: boolean
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_fetch_started_at?: string | null
          last_successful_fetch_at?: string | null
          name?: string
          notes?: string | null
          parser_config?: Json
          parser_version?: string | null
          reliability_score?: number
          slug?: string
          source_authority?: string
          source_priority?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      venues: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          city: string
          created_at: string
          display_name: string
          id: string
          latitude: number | null
          location: unknown
          longitude: number | null
          neighborhood: string | null
          normalized_name: string
          postal_code: string | null
          slug: string | null
          state: string
          updated_at: string
          venue_type: string | null
          website_url: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string
          created_at?: string
          display_name: string
          id?: string
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          neighborhood?: string | null
          normalized_name: string
          postal_code?: string | null
          slug?: string | null
          state?: string
          updated_at?: string
          venue_type?: string | null
          website_url?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string
          created_at?: string
          display_name?: string
          id?: string
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          neighborhood?: string | null
          normalized_name?: string
          postal_code?: string | null
          slug?: string | null
          state?: string
          updated_at?: string
          venue_type?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bb_create_event: {
        Args: {
          p_address: string
          p_category: string
          p_city: string
          p_description: string
          p_end_time: string
          p_lat: number
          p_lon: number
          p_manage_token?: string
          p_price_display: string
          p_price_high: number
          p_price_low: number
          p_start_time: string
          p_submitter_email: string
          p_ticket_url: string
          p_title: string
          p_venue: string
        }
        Returns: {
          id: string
          manage_token: string
        }[]
      }
      bb_duplicate_event: {
        Args: { p_id: string; p_token: string }
        Returns: {
          id: string
          start_time: string
        }[]
      }
      bb_find_nearby_venue:
        | {
            Args: {
              p_lat: number
              p_lng: number
              p_query_name?: string
              p_radius_meters?: number
            }
            Returns: {
              display_name: string
              distance_meters: number
              id: string
              name_similarity: number
              normalized_name: string
            }[]
          }
        | {
            Args: { p_lat: number; p_lng: number; p_radius_meters?: number }
            Returns: {
              city: string
              display_name: string
              distance_meters: number
              id: string
            }[]
          }
      bb_get_event: {
        Args: { p_id: string }
        Returns: {
          category: string
          city: string
          description: string
          end_time: string
          id: string
          lat: number
          lon: number
          price_display: string
          price_high: number
          price_low: number
          source: string
          start_time: string
          ticket_url: string
          title: string
          venue: string
        }[]
      }
      bb_get_feed_events: {
        Args: {
          p_mode?: string
          p_radius_miles: number
          p_user_lat: number
          p_user_lng: number
          p_window_end: string
          p_window_start: string
        }
        Returns: {
          canonical_image_url: string
          canonical_url: string
          category_tags: string[]
          city: string
          description: string
          distance_miles: number
          end_time: string
          id: string
          neighborhood: string
          price_display: string
          price_max: number
          price_min: number
          price_status: string
          start_time: string
          title: string
          venue_name: string
          vibe_labels: string[]
        }[]
      }
      bb_get_feed_events_v2: {
        Args: {
          p_mode?: string
          p_radius_miles: number
          p_user_lat: number
          p_user_lng: number
          p_window_end: string
          p_window_start: string
        }
        Returns: {
          age_restriction: string
          canonical_image_url: string
          canonical_url: string
          category_tags: string[]
          city: string
          description: string
          distance_miles: number
          end_time: string
          id: string
          indoor_outdoor: string
          neighborhood: string
          price_display: string
          price_max: number
          price_min: number
          price_status: string
          source_count: number
          start_time: string
          title: string
          venue_latitude: number
          venue_longitude: number
          venue_name: string
          vibe_labels: string[]
        }[]
      }
      bb_get_public_event: {
        Args: { p_id: string }
        Returns: {
          canonical_image_url: string
          canonical_url: string
          category_tags: string[]
          city: string
          description: string
          end_time: string
          id: string
          neighborhood: string
          price_display: string
          price_max: number
          price_min: number
          price_status: string
          start_time: string
          state: string
          title: string
          venue_name: string
          vibe_labels: string[]
        }[]
      }
      bb_my_events: {
        Args: { p_token: string }
        Returns: {
          category: string
          city: string
          description: string
          end_time: string
          id: string
          lat: number
          lon: number
          price_display: string
          price_high: number
          price_low: number
          source: string
          start_time: string
          ticket_url: string
          title: string
          venue: string
        }[]
      }
      bb_public_events: {
        Args: { p_end: string; p_start: string }
        Returns: {
          category: string
          city: string
          description: string
          end_time: string
          id: string
          lat: number
          lon: number
          price_display: string
          price_high: number
          price_low: number
          source: string
          start_time: string
          ticket_url: string
          title: string
          venue: string
        }[]
      }
      bb_unpublish_event: {
        Args: { p_id: string; p_token: string }
        Returns: boolean
      }
      bb_update_event: {
        Args: {
          p_address?: string
          p_category?: string
          p_city?: string
          p_description?: string
          p_end_time?: string
          p_id: string
          p_price_display?: string
          p_price_high?: number
          p_price_low?: number
          p_start_time?: string
          p_ticket_url?: string
          p_title?: string
          p_token: string
          p_venue?: string
        }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
