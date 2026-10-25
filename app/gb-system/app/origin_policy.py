"""[HTTP DEMO ADD] Explicit presentation mode; normal shared deployments require HTTPS."""
import ipaddress
from urllib.parse import urlsplit


def validate_origin(value, *, http_demo=False):
    value = value.rstrip('/')
    origin = urlsplit(value)
    try:
        port = origin.port
    except ValueError as error:
        raise ValueError('Invalid origin port.') from error
    if (origin.username is not None or origin.password is not None or origin.path
            or origin.query or origin.fragment or not origin.hostname
            or any(c.isspace() for c in value)):
        raise ValueError('Use scheme://host[:port] without credentials, path, query or fragment.')
    loopback = origin.hostname in ('localhost', '127.0.0.1', '::1')
    if http_demo:
        try:
            address = ipaddress.IPv4Address(origin.hostname)
        except ipaddress.AddressValueError as error:
            raise ValueError('HTTP demo requires the EC2 IPv4 address.') from error
        if (origin.scheme != 'http' or loopback or address.is_unspecified
                or address.is_multicast or port is None):
            raise ValueError('HTTP demo requires http://EC2_IP:port.')
    elif origin.scheme != 'https' and not (origin.scheme == 'http' and loopback):
        raise ValueError('Shared HTTP requires explicit HTTP demo mode; otherwise use HTTPS.')
    return origin


def demo_request_origin(host_header, expected_port):
    """Allow a changed EC2 IPv4 after reboot; never trust arbitrary domain/forwarded headers."""
    value = 'http://' + host_header
    origin = validate_origin(value, http_demo=True)
    if origin.port != expected_port:
        raise ValueError('Unexpected presentation port.')
    return value
