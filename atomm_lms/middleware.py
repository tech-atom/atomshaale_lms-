from django.utils.deprecation import MiddlewareMixin

class CSPFrameAllowMiddleware(MiddlewareMixin):
    """
    Extends Content Security Policy headers to allow safe embedding of
    YouTube videos and Google Docs Viewer without overriding existing CSP rules.
    """

    def process_response(self, request, response):
        # Get any existing CSP header (from django-csp or settings)
        existing_csp = response.get("Content-Security-Policy", "")

        # Append safe frame and media sources if not already allowed
        additional_sources = (
            "frame-src 'self' https://www.youtube.com https://docs.google.com; "
            "media-src 'self' https://www.youtube.com https://docs.google.com; "
            "child-src 'self' https://www.youtube.com https://docs.google.com;"
        )

        if "frame-src" not in existing_csp:
            response["Content-Security-Policy"] = existing_csp + " " + additional_sources
        return response
